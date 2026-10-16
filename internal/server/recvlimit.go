package server

import (
	"errors"
	"fmt"
	"math"
	"math/big"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	envGRPCMaxRecvEnabled = "GRPC_MAX_RECV_ENABLED"
	envGRPCMaxRecvSize    = "GRPC_MAX_RECV_SIZE"

	kibibyte = 1 << 10
	mebibyte = 1 << 20
	gibibyte = 1 << 30

	// The documented "100MB" default: used when the limit is enabled and the size is unset or empty.
	defaultGRPCMaxRecvSize = 100 * mebibyte

	// Replaces gRPC's 4 MiB server default when the limit is disabled.
	unlimitedRecvMsgSize = math.MaxInt32

	// Bounds of a configured size after flooring; grpc.MaxRecvMsgSize takes an int and the spec caps it at MaxInt32.
	minByteSize = 1
	maxByteSize = math.MaxInt32

	decimalBase = 10
)

// Lower-case ASCII unit suffix -> 1024-based multiplier. "B" is deliberately absent:
// the spec lists exactly these six units and "no unit means bytes".
var byteSizeUnits = map[string]int64{
	"kb": kibibyte, "kib": kibibyte,
	"mb": mebibyte, "mib": mebibyte,
	"gb": gibibyte, "gib": gibibyte,
}

var (
	errInvalidRecvLimitEnabled = errors.New("must be empty or one of 1, t, T, TRUE, true, True, 0, f, F, FALSE, false, False")
	errInvalidByteSizeSyntax   = errors.New("want <number>[unit]: digits or digits.digits, optional unit KB, KiB, MB, MiB, GB or GiB (case-insensitive, 1024-based), no sign or spaces")
	errByteSizeOutOfRange      = fmt.Errorf("must be between %d and %d bytes", minByteSize, maxByteSize)
)

// decimalNumber is a scanned <number>; both fields hold ASCII digits only, and
// fractionDigits is empty when the input had no decimal point.
type decimalNumber struct {
	integerDigits  string
	fractionDigits string
}

// resolveMaxRecvMsgSize returns the value for grpc.MaxRecvMsgSize configured by the
// GRPC_MAX_RECV_* variables, read through getenv (os.Getenv in production).
func resolveMaxRecvMsgSize(getenv func(string) string) (int, error) {
	enabledRaw := getenv(envGRPCMaxRecvEnabled)
	enabled, err := parseRecvLimitEnabled(enabledRaw)
	if err != nil {
		return 0, invalidEnvError(envGRPCMaxRecvEnabled, enabledRaw, err)
	}
	if !enabled {
		return unlimitedRecvMsgSize, nil
	}

	sizeRaw := getenv(envGRPCMaxRecvSize)
	if sizeRaw == "" {
		return defaultGRPCMaxRecvSize, nil
	}
	size, err := parseByteSize(sizeRaw)
	if err != nil {
		return 0, invalidEnvError(envGRPCMaxRecvSize, sizeRaw, err)
	}
	return size, nil
}

func parseRecvLimitEnabled(raw string) (bool, error) {
	if raw == "" {
		return false, nil
	}
	enabled, err := strconv.ParseBool(raw)
	if err != nil {
		// strconv's error repeats the value, which invalidEnvError already quotes.
		return false, errInvalidRecvLimitEnabled
	}
	return enabled, nil
}

// parseByteSize returns the whole number of bytes described by raw, within [minByteSize, maxByteSize].
func parseByteSize(raw string) (int, error) {
	number, unit, err := splitNumberAndUnit(raw)
	if err != nil {
		return 0, err
	}
	multiplier, err := unitMultiplier(unit)
	if err != nil {
		return 0, err
	}
	byteCount, err := floorBytes(number, multiplier)
	if err != nil {
		return 0, err
	}
	// The range check follows flooring (spec) and precedes the int conversion, so nothing wraps on 32-bit platforms.
	if !byteCount.IsInt64() || byteCount.Int64() < minByteSize || byteCount.Int64() > maxByteSize {
		return 0, fmt.Errorf("%d bytes after flooring: %w", byteCount, errByteSizeOutOfRange)
	}
	return int(byteCount.Int64()), nil
}

// splitNumberAndUnit scans the <number> prefix and returns the remainder as the unit candidate.
func splitNumberAndUnit(raw string) (decimalNumber, string, error) {
	integerLen := leadingDigitCount(raw)
	if integerLen == 0 {
		return decimalNumber{}, "", fmt.Errorf("must start with a digit: %w", errInvalidByteSizeSyntax)
	}
	number := decimalNumber{integerDigits: raw[:integerLen]}
	rest := raw[integerLen:]

	if afterDot, found := strings.CutPrefix(rest, "."); found {
		fractionLen := leadingDigitCount(afterDot)
		if fractionLen == 0 {
			return decimalNumber{}, "", fmt.Errorf("missing digit after the decimal point: %w", errInvalidByteSizeSyntax)
		}
		number.fractionDigits = afterDot[:fractionLen]
		rest = afterDot[fractionLen:]
	}
	return number, rest, nil
}

func unitMultiplier(unit string) (int64, error) {
	if unit == "" {
		return 1, nil
	}
	// strings.ToLower maps U+212A KELVIN SIGN to "k", so "1KB" would otherwise be accepted as KB.
	if !isASCII(unit) {
		return 0, fmt.Errorf("unknown unit %q: %w", unit, errInvalidByteSizeSyntax)
	}
	multiplier, known := byteSizeUnits[strings.ToLower(unit)]
	if !known {
		return 0, fmt.Errorf("unknown unit %q: %w", unit, errInvalidByteSizeSyntax)
	}
	return multiplier, nil
}

// floorBytes computes floor((I + F/10^k) * multiplier) exactly, where I and F are the
// integer and fraction digits of n and k is the number of fraction digits.
func floorBytes(n decimalNumber, multiplier int64) (*big.Int, error) {
	mantissa, ok := new(big.Int).SetString(n.integerDigits+n.fractionDigits, decimalBase)
	if !ok {
		// Unreachable for scanner output; prevents a nil *big.Int if the grammar ever changes.
		return nil, errInvalidByteSizeSyntax
	}
	mantissa.Mul(mantissa, big.NewInt(multiplier))
	scale := new(big.Int).Exp(big.NewInt(decimalBase), big.NewInt(int64(len(n.fractionDigits))), nil)
	// Both operands are non-negative, so Quo's truncation is a floor.
	return mantissa.Quo(mantissa, scale), nil
}

// leadingDigitCount counts leading ASCII digits; unicode.IsDigit would also accept
// non-ASCII digits such as U+FF11 (fullwidth one).
func leadingDigitCount(s string) int {
	count := 0
	for count < len(s) && '0' <= s[count] && s[count] <= '9' {
		count++
	}
	return count
}

func isASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] >= utf8.RuneSelf {
			return false
		}
	}
	return true
}

// invalidEnvError names the variable and quotes its value; %q makes empty values,
// spaces and a stray \r from a CRLF .env file visible.
func invalidEnvError(name, value string, err error) error {
	return fmt.Errorf("invalid %s %q: %w", name, value, err)
}
