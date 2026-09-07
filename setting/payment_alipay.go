package setting

// 支付宝（直连开放平台，公钥模式）配置。
// 资金直达商户自己的支付宝账户，不经过第三方聚合网关。
var (
	// AlipayAppID 开放平台应用 AppID。
	AlipayAppID = ""
	// AlipayPrivateKey 应用私钥（RSA2），用于请求签名。
	AlipayPrivateKey = ""
	// AlipayPublicKey 支付宝公钥（RSA2），用于回调验签。
	AlipayPublicKey = ""
	// AlipaySandbox 是否使用沙箱网关。
	AlipaySandbox = false
	// AlipayMinTopUp 单笔最低充值数量（余额单位，实付人民币 = 数量 × 单位价格）。
	AlipayMinTopUp = 1
	// AlipayForcePcAmount 达到该金额（含）强制走电脑网站支付，忽略移动端 UA。
	AlipayForcePcAmount = 50.0
)
