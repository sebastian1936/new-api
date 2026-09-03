package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/common/alipay"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

// AlipayPayRequest 前端发起支付宝充值的请求体。
// Amount 单位为人民币元，1 元 = 1 余额单位。
type AlipayPayRequest struct {
	Amount        float64 `json:"amount"`
	PaymentMethod string  `json:"payment_method"`
}

// getAlipayClient 依据当前配置构造支付宝客户端；配置缺失或非法返回 nil。
func getAlipayClient() *alipay.Client {
	if !isAlipayTopUpEnabled() {
		return nil
	}
	client, err := alipay.NewClient(&alipay.Config{
		AppID:           setting.AlipayAppID,
		PrivateKey:      setting.AlipayPrivateKey,
		AlipayPublicKey: setting.AlipayPublicKey,
		Sandbox:         setting.AlipaySandbox,
	})
	if err != nil {
		common.SysError(fmt.Sprintf("支付宝 client 初始化失败 error=%q", err.Error()))
		return nil
	}
	return client
}

// isMobileUA 粗略判断请求是否来自移动端浏览器。
func isMobileUA(userAgent string) bool {
	ua := strings.ToLower(userAgent)
	for _, kw := range []string{"iphone", "ipod", "android", "mobile", "windows phone", "harmony"} {
		if strings.Contains(ua, kw) {
			return true
		}
	}
	return false
}

// RequestAlipayPay 创建支付宝充值订单并返回收银台跳转地址。
// 支付方式选择规则：
//   - 金额 >= AlipayForcePcAmount：强制电脑网站支付（page.pay）。
//   - 否则按浏览器 UA：移动端走手机网站支付（wap.pay），PC 走电脑网站支付。
func RequestAlipayPay(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	var req AlipayPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	if req.PaymentMethod != model.PaymentMethodAlipay {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "不支持的支付渠道"})
		return
	}

	client := getAlipayClient()
	if client == nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "当前管理员未配置支付宝支付信息"})
		return
	}

	// 金额校验：正数、最低充值、上限（防止溢出与异常大额）。
	if req.Amount <= 0 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额必须大于 0"})
		return
	}
	if req.Amount < float64(setting.AlipayMinTopUp) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值金额不能小于 %d 元", setting.AlipayMinTopUp)})
		return
	}
	if req.Amount > alipayMaxTopUp {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值金额不能大于 %.0f 元", alipayMaxTopUp)})
		return
	}

	// 金额规整为两位小数（支付宝要求），并作为实付人民币金额。
	dMoney := decimal.NewFromFloat(req.Amount).Round(2)
	payMoney := dMoney.InexactFloat64()
	if payMoney < 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}
	totalAmount := dMoney.StringFixed(2)

	id := c.GetInt("id")

	tradeNo := fmt.Sprintf("ALIUSR%dNO%s%d", id, common.GetRandomString(6), time.Now().Unix())

	callBackAddress := service.GetCallbackAddress()
	notifyUrl := callBackAddress + "/api/user/alipay/notify"
	returnUrl := paymentReturnPath("/wallet")

	// Amount 字段与 Money 字段都存人民币金额，充值到账时按 Money * QuotaPerUnit 计算。
	topUp := &model.TopUp{
		UserId:          id,
		Amount:          int64(dMoney.IntPart()),
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodAlipay,
		PaymentProvider: model.PaymentProviderAlipay,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("支付宝 创建充值订单失败 user_id=%d trade_no=%s amount=%.2f error=%q", id, tradeNo, payMoney, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}

	pay := &alipay.TradePay{
		OutTradeNo:  tradeNo,
		Subject:     fmt.Sprintf("余额充值 %.2f 元", payMoney),
		TotalAmount: totalAmount,
		NotifyURL:   notifyUrl,
		ReturnURL:   returnUrl,
	}

	// 金额 >= 强制 PC 阈值时走电脑网站支付，否则按 UA 判断。
	useWap := isMobileUA(c.Request.UserAgent()) && payMoney < setting.AlipayForcePcAmount

	var payUrl string
	var err error
	if useWap {
		payUrl, err = client.WapPayURL(pay)
	} else {
		payUrl, err = client.PagePayURL(pay)
	}
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("支付宝 拉起支付失败 user_id=%d trade_no=%s amount=%.2f wap=%t error=%q", id, tradeNo, payMoney, useWap, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("支付宝 充值订单创建成功 user_id=%d trade_no=%s amount=%.2f wap=%t", id, tradeNo, payMoney, useWap))
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data":    gin.H{"pay_url": payUrl, "trade_no": tradeNo},
		"url":     payUrl,
	})
}

// alipayMaxTopUp 单笔充值金额上限（人民币元），防止异常大额与配额溢出。
const alipayMaxTopUp = 100000.0

// AlipayNotify 处理支付宝异步支付结果通知。
// 校验签名与业务参数后完成充值，成功需返回纯文本 "success"。
func AlipayNotify(c *gin.Context) {
	if !isAlipayWebhookEnabled() {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝 webhook 被拒绝 reason=webhook_disabled client_ip=%s", c.ClientIP()))
		_, _ = c.Writer.WriteString("failure")
		return
	}

	if err := c.Request.ParseForm(); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("支付宝 webhook 表单解析失败 client_ip=%s error=%q", c.ClientIP(), err.Error()))
		_, _ = c.Writer.WriteString("failure")
		return
	}

	params := make(map[string]string, len(c.Request.PostForm))
	for k := range c.Request.PostForm {
		params[k] = c.Request.PostForm.Get(k)
	}
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("支付宝 webhook 收到请求 client_ip=%s params=%q", c.ClientIP(), common.GetJsonString(params)))

	client := getAlipayClient()
	if client == nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("支付宝 client 未初始化 client_ip=%s", c.ClientIP()))
		_, _ = c.Writer.WriteString("failure")
		return
	}

	if err := client.VerifyNotify(params); err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝 webhook 验签失败 client_ip=%s error=%q", c.ClientIP(), err.Error()))
		_, _ = c.Writer.WriteString("failure")
		return
	}

	// 校验应用一致性，防止伪造/串号回调。
	if appId := params["app_id"]; appId != "" && appId != setting.AlipayAppID {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝 webhook app_id 不匹配 got=%s want=%s client_ip=%s", appId, setting.AlipayAppID, c.ClientIP()))
		_, _ = c.Writer.WriteString("failure")
		return
	}

	tradeStatus := params["trade_status"]
	if tradeStatus != "TRADE_SUCCESS" && tradeStatus != "TRADE_FINISHED" {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("支付宝 webhook 忽略非成功事件 trade_status=%s out_trade_no=%s client_ip=%s", tradeStatus, params["out_trade_no"], c.ClientIP()))
		_, _ = c.Writer.WriteString("success")
		return
	}

	outTradeNo := params["out_trade_no"]
	if outTradeNo == "" {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝 webhook 缺少 out_trade_no client_ip=%s", c.ClientIP()))
		_, _ = c.Writer.WriteString("failure")
		return
	}

	LockOrder(outTradeNo)
	defer UnlockOrder(outTradeNo)

	topUp := model.GetTopUpByTradeNo(outTradeNo)
	if topUp == nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝 回调订单不存在 out_trade_no=%s client_ip=%s", outTradeNo, c.ClientIP()))
		_, _ = c.Writer.WriteString("failure")
		return
	}
	if topUp.PaymentProvider != model.PaymentProviderAlipay {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝 订单支付网关不匹配 out_trade_no=%s order_provider=%s client_ip=%s", outTradeNo, topUp.PaymentProvider, c.ClientIP()))
		_, _ = c.Writer.WriteString("failure")
		return
	}

	// 幂等：已成功订单直接返回 success，避免支付宝重复通知造成重复入账。
	if topUp.Status != common.TopUpStatusPending {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("支付宝 订单状态非 pending，忽略处理 out_trade_no=%s status=%s client_ip=%s", outTradeNo, topUp.Status, c.ClientIP()))
		_, _ = c.Writer.WriteString("success")
		return
	}

	// 校验回调金额与订单金额一致，防止金额篡改。
	if notifyAmount, err := strconv.ParseFloat(params["total_amount"], 64); err == nil {
		if decimal.NewFromFloat(notifyAmount).Cmp(decimal.NewFromFloat(topUp.Money)) != 0 {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("支付宝 回调金额与订单不一致 out_trade_no=%s notify_amount=%.2f order_money=%.2f client_ip=%s", outTradeNo, notifyAmount, topUp.Money, c.ClientIP()))
			_, _ = c.Writer.WriteString("failure")
			return
		}
	}

	if err := model.RechargeAlipay(outTradeNo, c.ClientIP()); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("支付宝 充值处理失败 out_trade_no=%s client_ip=%s error=%q", outTradeNo, c.ClientIP(), err.Error()))
		_, _ = c.Writer.WriteString("failure")
		return
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("支付宝 充值成功 out_trade_no=%s user_id=%d money=%.2f client_ip=%s", outTradeNo, topUp.UserId, topUp.Money, c.ClientIP()))
	_, _ = c.Writer.WriteString("success")
}
