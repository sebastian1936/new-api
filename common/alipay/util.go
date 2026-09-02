package alipay

import (
	"time"

	"github.com/QuantumNous/new-api/common"
)

// beijingLoc 支付宝要求 timestamp 使用 GMT+8。
var beijingLoc = time.FixedZone("CST", 8*3600)

// nowInBeijing 返回 "yyyy-MM-dd HH:mm:ss" 格式的北京时间。
func nowInBeijing() string {
	return time.Now().In(beijingLoc).Format("2006-01-02 15:04:05")
}

// marshalBiz 通过项目统一的 JSON 封装序列化业务参数。
func marshalBiz(v any) ([]byte, error) {
	return common.Marshal(v)
}
