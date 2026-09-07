package common

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math/big"
	"strings"
	"sync"
	"time"

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// 图形验证码：自建数字验证码，用于阻挡脚本批量注册。
//
// 定位说明：数字图形验证码可被 OCR 破解，它的目标是拦住"裸脚本"批量请求，
// 而非对抗定向攻击。因此这里同时依赖注册接口自身的限流（CriticalRateLimit）
// 与一次性校验，形成多层防护，而不是把安全性完全押在图片识别难度上。

const (
	// CaptchaCodeLength 验证码位数。
	CaptchaCodeLength = 4
	// CaptchaValidDuration 验证码有效期。短有效期压缩暴力尝试窗口。
	CaptchaValidDuration = 3 * time.Minute
	// captchaRedisKeyPrefix Redis 键前缀。
	captchaRedisKeyPrefix = "captcha:"
	// captchaImageWidth / captchaImageHeight 图片尺寸。
	captchaImageWidth  = 140
	captchaImageHeight = 48
	// captchaMemoryMaxSize 内存兜底存储的最大条目数，防止未启用 Redis 时无界增长。
	captchaMemoryMaxSize = 5000
)

// CaptchaEnabled 是否开启注册图形验证码，由系统设置控制。
var CaptchaEnabled = false

type captchaEntry struct {
	code      string
	expiresAt time.Time
}

// 内存兜底存储：仅在未启用 Redis 时使用。
// 注意：多实例部署（如蓝绿）下内存存储无法跨实例共享，生成与校验若落在不同
// 实例会失败，因此生产环境应启用 Redis。
var (
	captchaMemoryMutex sync.Mutex
	captchaMemoryStore = make(map[string]captchaEntry)
)

// randomInt 返回 [0, max) 内的安全随机数。
// 使用 crypto/rand 而非 math/rand，避免验证码序列被预测。
func randomInt(max int) (int, error) {
	if max <= 0 {
		return 0, fmt.Errorf("invalid max: %d", max)
	}
	n, err := rand.Int(rand.Reader, big.NewInt(int64(max)))
	if err != nil {
		return 0, err
	}
	return int(n.Int64()), nil
}

// generateCaptchaCode 生成指定位数的纯数字验证码。
func generateCaptchaCode(length int) (string, error) {
	var sb strings.Builder
	for i := 0; i < length; i++ {
		digit, err := randomInt(10)
		if err != nil {
			return "", err
		}
		sb.WriteByte(byte('0' + digit))
	}
	return sb.String(), nil
}

// storeCaptchaCode 保存验证码答案，优先 Redis，未启用时退回内存。
func storeCaptchaCode(id string, code string) error {
	if RedisEnabled {
		return RedisSet(captchaRedisKeyPrefix+id, code, CaptchaValidDuration)
	}

	captchaMemoryMutex.Lock()
	defer captchaMemoryMutex.Unlock()
	if len(captchaMemoryStore) >= captchaMemoryMaxSize {
		removeExpiredCaptchas()
	}
	// 清理后仍超限说明短时间内涌入大量请求，直接拒绝而不是无界增长。
	if len(captchaMemoryStore) >= captchaMemoryMaxSize {
		return fmt.Errorf("captcha store is full")
	}
	captchaMemoryStore[id] = captchaEntry{
		code:      code,
		expiresAt: time.Now().Add(CaptchaValidDuration),
	}
	return nil
}

// removeExpiredCaptchas 清理过期的内存验证码。调用方需持有 captchaMemoryMutex。
func removeExpiredCaptchas() {
	now := time.Now()
	for id, entry := range captchaMemoryStore {
		if now.After(entry.expiresAt) {
			delete(captchaMemoryStore, id)
		}
	}
}

// VerifyCaptcha 校验验证码并立即失效（一次性使用，防重放）。
// 无论校验成功或失败都删除记录，使每张验证码只有一次尝试机会，
// 从而阻断对 4 位数字的暴力穷举。
func VerifyCaptcha(id string, code string) bool {
	if id == "" || code == "" {
		return false
	}

	if RedisEnabled {
		key := captchaRedisKeyPrefix + id
		stored, err := RedisGet(key)
		// 取出后立即删除，成功与否都不再复用。
		if delErr := RedisDel(key); delErr != nil {
			SysError("failed to delete captcha key: " + delErr.Error())
		}
		if err != nil {
			return false
		}
		return stored == code
	}

	captchaMemoryMutex.Lock()
	defer captchaMemoryMutex.Unlock()
	entry, ok := captchaMemoryStore[id]
	delete(captchaMemoryStore, id)
	if !ok || time.Now().After(entry.expiresAt) {
		return false
	}
	return entry.code == code
}

// GenerateCaptcha 生成一张数字验证码，返回验证码 ID 与 PNG 的 data URL。
// 答案存于服务端（Redis/内存），响应中不包含答案。
func GenerateCaptcha() (id string, dataURL string, err error) {
	code, err := generateCaptchaCode(CaptchaCodeLength)
	if err != nil {
		return "", "", err
	}

	id = GetRandomString(32)
	if err = storeCaptchaCode(id, code); err != nil {
		return "", "", err
	}

	dataURL, err = renderCaptchaImage(code)
	if err != nil {
		return "", "", err
	}
	return id, dataURL, nil
}

// renderCaptchaImage 将验证码文本渲染为带干扰的 PNG，返回 base64 data URL。
// 使用 basicfont 内置位图字体，避免引入字体文件依赖；通过随机背景、噪点、
// 干扰线和逐字符抖动增加自动化识别成本。
func renderCaptchaImage(code string) (string, error) {
	img := image.NewRGBA(image.Rect(0, 0, captchaImageWidth, captchaImageHeight))

	// 浅色随机背景，保证与深色文字有足够对比度。
	bgShade, err := randomInt(24)
	if err != nil {
		return "", err
	}
	background := color.RGBA{
		R: uint8(231 + bgShade),
		G: uint8(231 + bgShade),
		B: uint8(231 + bgShade),
		A: 255,
	}
	for y := 0; y < captchaImageHeight; y++ {
		for x := 0; x < captchaImageWidth; x++ {
			img.Set(x, y, background)
		}
	}

	if err = drawCaptchaNoise(img); err != nil {
		return "", err
	}
	if err = drawCaptchaLines(img); err != nil {
		return "", err
	}
	if err = drawCaptchaText(img, code); err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err = png.Encode(&buf, img); err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

// drawCaptchaNoise 绘制随机噪点。
func drawCaptchaNoise(img *image.RGBA) error {
	const noiseCount = 140
	for i := 0; i < noiseCount; i++ {
		x, err := randomInt(captchaImageWidth)
		if err != nil {
			return err
		}
		y, err := randomInt(captchaImageHeight)
		if err != nil {
			return err
		}
		shade, err := randomInt(150)
		if err != nil {
			return err
		}
		img.Set(x, y, color.RGBA{
			R: uint8(shade),
			G: uint8(shade),
			B: uint8(shade),
			A: 120,
		})
	}
	return nil
}

// drawCaptchaLines 绘制贯穿的干扰线，破坏字符切割。
// 线条保持细(1px)、半透明，且数量较少，避免遮挡数字影响人眼识别。
func drawCaptchaLines(img *image.RGBA) error {
	const lineCount = 2
	for i := 0; i < lineCount; i++ {
		startY, err := randomInt(captchaImageHeight)
		if err != nil {
			return err
		}
		endY, err := randomInt(captchaImageHeight)
		if err != nil {
			return err
		}
		r, err := randomInt(190)
		if err != nil {
			return err
		}
		g, err := randomInt(190)
		if err != nil {
			return err
		}
		b, err := randomInt(190)
		if err != nil {
			return err
		}
		lineColor := color.RGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: 110}
		// 按 x 线性插值，画出一条从左到右的斜线。
		for x := 0; x < captchaImageWidth; x++ {
			y := startY + (endY-startY)*x/captchaImageWidth
			img.Set(x, y, lineColor)
		}
	}
	return nil
}

// captchaGlyphScale 字符放大倍数。basicfont 是 7x13 位图字体，直接绘制在
// 140x48 的画布上偏小，这里先渲染再整数倍放大，兼顾清晰度与无字体文件依赖。
const captchaGlyphScale = 3

// drawCaptchaText 逐字符绘制验证码，带随机位置抖动与颜色变化。
// 每个字符先渲染到独立小图，再按 captchaGlyphScale 放大贴入主图，
// 使数字足够大、笔画连续，便于人眼识别。
func drawCaptchaText(img *image.RGBA, code string) error {
	face := basicfont.Face7x13
	const glyphW, glyphH = 7, 13
	// 基于图片宽度均分每个字符的水平空间。
	slotWidth := captchaImageWidth / len(code)
	scaledH := glyphH * captchaGlyphScale

	for i, ch := range code {
		r, err := randomInt(80)
		if err != nil {
			return err
		}
		g, err := randomInt(80)
		if err != nil {
			return err
		}
		b, err := randomInt(80)
		if err != nil {
			return err
		}
		jitterX, err := randomInt(7)
		if err != nil {
			return err
		}
		jitterY, err := randomInt(7)
		if err != nil {
			return err
		}

		// 单字符渲染到小图，基线设在底部上方 2px 以容纳字形下延部分。
		glyph := image.NewRGBA(image.Rect(0, 0, glyphW, glyphH))
		drawer := &font.Drawer{
			Dst:  glyph,
			Src:  image.NewUniform(color.RGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: 255}),
			Face: face,
		}
		drawer.Dot = fixed.P(0, glyphH-2)
		drawer.DrawString(string(ch))

		// 放大贴图：把每个源像素铺成 scale x scale 的方块。
		offsetX := slotWidth*i + jitterX + 2
		offsetY := (captchaImageHeight-scaledH)/2 + jitterY - 3
		for gy := 0; gy < glyphH; gy++ {
			for gx := 0; gx < glyphW; gx++ {
				_, _, _, alpha := glyph.At(gx, gy).RGBA()
				if alpha == 0 {
					continue
				}
				srcColor := glyph.At(gx, gy)
				for dy := 0; dy < captchaGlyphScale; dy++ {
					for dx := 0; dx < captchaGlyphScale; dx++ {
						px := offsetX + gx*captchaGlyphScale + dx
						py := offsetY + gy*captchaGlyphScale + dy
						if px < 0 || px >= captchaImageWidth || py < 0 || py >= captchaImageHeight {
							continue
						}
						img.Set(px, py, srcColor)
					}
				}
			}
		}
	}
	return nil
}
