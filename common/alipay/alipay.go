// Package alipay 提供支付宝开放平台（公钥模式，RSA2 签名）的最小实现。
// 仅依赖 Go 标准库，不引入任何第三方 SDK，方便在 CI 中直接编译。
//
// 支持能力：
//   - alipay.trade.page.pay（电脑网站支付，返回 GET 跳转 URL）
//   - alipay.trade.wap.pay（手机网站支付，返回 GET 跳转 URL）
//   - 异步/同步通知的验签（RSA2）
package alipay

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strings"
)

const (
	// 生产网关地址
	gatewayProd = "https://openapi.alipay.com/gateway.do"
	// 沙箱网关地址
	gatewaySandbox = "https://openapi-sandbox.dl.alipaydev.com/gateway.do"

	signTypeRSA2 = "RSA2"

	MethodPagePay = "alipay.trade.page.pay"
	MethodWapPay  = "alipay.trade.wap.pay"
)

// Client 支付宝客户端（公钥模式）。
type Client struct {
	appID      string
	privateKey *rsa.PrivateKey // 应用私钥，用于请求签名
	publicKey  *rsa.PublicKey  // 支付宝公钥，用于回调验签
	gateway    string
}

// Config 客户端配置。
type Config struct {
	AppID string
	// 应用私钥，支持带/不带 PEM 头，PKCS1 或 PKCS8 格式。
	PrivateKey string
	// 支付宝公钥（不是应用公钥），用于验签。
	AlipayPublicKey string
	// 是否使用沙箱网关。
	Sandbox bool
}

// NewClient 校验并构造客户端；任一密钥无法解析都会返回错误。
func NewClient(cfg *Config) (*Client, error) {
	if strings.TrimSpace(cfg.AppID) == "" {
		return nil, errors.New("alipay: app id 为空")
	}
	priv, err := parsePrivateKey(cfg.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("alipay: 解析应用私钥失败: %w", err)
	}
	pub, err := parsePublicKey(cfg.AlipayPublicKey)
	if err != nil {
		return nil, fmt.Errorf("alipay: 解析支付宝公钥失败: %w", err)
	}
	gateway := gatewayProd
	if cfg.Sandbox {
		gateway = gatewaySandbox
	}
	return &Client{
		appID:      cfg.AppID,
		privateKey: priv,
		publicKey:  pub,
		gateway:    gateway,
	}, nil
}

// TradePay 网页/手机网站支付下单参数。
type TradePay struct {
	// 商户订单号，需保证唯一。
	OutTradeNo string
	// 订单标题。
	Subject string
	// 订单总金额，单位元，最多两位小数，字符串形式如 "12.00"。
	TotalAmount string
	// 异步通知地址（支付宝服务器回调）。
	NotifyURL string
	// 同步跳转地址（用户支付后浏览器返回）。
	ReturnURL string
}

// bizContent 电脑/手机网站支付的业务参数（两者字段一致）。
type bizContent struct {
	OutTradeNo  string `json:"out_trade_no"`
	TotalAmount string `json:"total_amount"`
	Subject     string `json:"subject"`
	ProductCode string `json:"product_code"`
}

// buildPayURL 组装签名后的 GET 跳转 URL。
// method 应为 MethodPagePay 或 MethodWapPay。
func (c *Client) buildPayURL(method string, p *TradePay) (string, error) {
	productCode := "FAST_INSTANT_TRADE_PAY"
	if method == MethodWapPay {
		productCode = "QUICK_WAP_WAY"
	}
	biz := bizContent{
		OutTradeNo:  p.OutTradeNo,
		TotalAmount: p.TotalAmount,
		Subject:     p.Subject,
		ProductCode: productCode,
	}
	bizJSON, err := marshalBiz(biz)
	if err != nil {
		return "", err
	}

	params := map[string]string{
		"app_id":      c.appID,
		"method":      method,
		"format":      "JSON",
		"charset":     "utf-8",
		"sign_type":   signTypeRSA2,
		"timestamp":   nowInBeijing(),
		"version":     "1.0",
		"biz_content": string(bizJSON),
		"notify_url":  p.NotifyURL,
		"return_url":  p.ReturnURL,
	}
	// 空值字段不参与请求与签名。
	for k, v := range params {
		if v == "" {
			delete(params, k)
		}
	}

	sign, err := c.sign(params)
	if err != nil {
		return "", err
	}
	params["sign"] = sign

	query := url.Values{}
	for k, v := range params {
		query.Set(k, v)
	}
	return c.gateway + "?" + query.Encode(), nil
}

// PagePayURL 电脑网站支付，返回可直接 302 跳转的收银台 URL。
func (c *Client) PagePayURL(p *TradePay) (string, error) {
	return c.buildPayURL(MethodPagePay, p)
}

// WapPayURL 手机网站支付，返回可直接 302 跳转的收银台 URL。
func (c *Client) WapPayURL(p *TradePay) (string, error) {
	return c.buildPayURL(MethodWapPay, p)
}

// VerifyNotify 校验支付宝异步/同步通知的签名。
// params 为回调携带的全部键值对（已 URL decode）。
func (c *Client) VerifyNotify(params map[string]string) error {
	sign := params["sign"]
	if sign == "" {
		return errors.New("alipay: 通知缺少 sign")
	}
	signType := params["sign_type"]
	if signType != "" && signType != signTypeRSA2 {
		return fmt.Errorf("alipay: 不支持的 sign_type %q", signType)
	}

	// 待验签内容需剔除 sign 与 sign_type，其余按 key 字典序拼接。
	content := buildSignContent(params, map[string]struct{}{
		"sign":      {},
		"sign_type": {},
	})

	sigBytes, err := base64.StdEncoding.DecodeString(sign)
	if err != nil {
		return fmt.Errorf("alipay: sign base64 解码失败: %w", err)
	}
	hashed := sha256.Sum256([]byte(content))
	if err := rsa.VerifyPKCS1v15(c.publicKey, crypto.SHA256, hashed[:], sigBytes); err != nil {
		return fmt.Errorf("alipay: 验签失败: %w", err)
	}
	return nil
}

// sign 对请求参数做 RSA2 签名，剔除已有的 sign 字段。
func (c *Client) sign(params map[string]string) (string, error) {
	content := buildSignContent(params, map[string]struct{}{
		"sign": {},
	})
	hashed := sha256.Sum256([]byte(content))
	sig, err := rsa.SignPKCS1v15(rand.Reader, c.privateKey, crypto.SHA256, hashed[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(sig), nil
}

// buildSignContent 按 key 字典序拼接 "k=v&k=v"，跳过空值与 exclude 中的键。
func buildSignContent(params map[string]string, exclude map[string]struct{}) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		if _, skip := exclude[k]; skip {
			continue
		}
		if params[k] == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte('&')
		}
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(params[k])
	}
	return b.String()
}

// parsePrivateKey 解析 PKCS1/PKCS8 的 RSA 私钥，兼容有无 PEM 头的输入。
func parsePrivateKey(raw string) (*rsa.PrivateKey, error) {
	block := decodePEMOrRaw(strings.TrimSpace(raw), "RSA PRIVATE KEY")
	if block == nil {
		return nil, errors.New("私钥内容为空或格式非法")
	}
	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}
	keyIface, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	key, ok := keyIface.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("私钥不是 RSA 类型")
	}
	return key, nil
}

// parsePublicKey 解析 PKIX 格式的 RSA 公钥，兼容有无 PEM 头的输入。
func parsePublicKey(raw string) (*rsa.PublicKey, error) {
	block := decodePEMOrRaw(strings.TrimSpace(raw), "PUBLIC KEY")
	if block == nil {
		return nil, errors.New("公钥内容为空或格式非法")
	}
	pubIface, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	pub, ok := pubIface.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("公钥不是 RSA 类型")
	}
	return pub, nil
}

// decodePEMOrRaw 尝试直接解析 PEM；若无 PEM 头，则按裸 base64 补上头再解析。
func decodePEMOrRaw(raw, pemType string) *pem.Block {
	if raw == "" {
		return nil
	}
	if block, _ := pem.Decode([]byte(raw)); block != nil {
		return block
	}
	// 去掉可能存在的换行/空格后，按裸 base64 处理。
	compact := strings.NewReplacer("\n", "", "\r", "", " ", "").Replace(raw)
	wrapped := "-----BEGIN " + pemType + "-----\n" + chunk64(compact) + "\n-----END " + pemType + "-----\n"
	block, _ := pem.Decode([]byte(wrapped))
	return block
}

// chunk64 将长字符串按 64 字符换行，符合 PEM 规范。
func chunk64(s string) string {
	const width = 64
	var b strings.Builder
	for len(s) > width {
		b.WriteString(s[:width])
		b.WriteByte('\n')
		s = s[width:]
	}
	b.WriteString(s)
	return b.String()
}
