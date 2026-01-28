#!/bin/bash
# =========================================================
# LVE Chain — Box Formatting Utility for Bash
# =========================================================
# Mirrors the TypeScript box.ts utility for consistent output
# Usage: source this file in other scripts
# =========================================================

BOX_WIDTH=${BOX_WIDTH:-59}

# Colors (optional, can be disabled with NO_COLOR=1)
if [ -z "$NO_COLOR" ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    DIM='\033[2m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    DIM=''
    BOLD=''
    NC=''
fi

# ==================== UNICODE SYMBOLS ====================
# These work in any UTF-8 terminal without special fonts

SYM_OK="✓"        # Checkmark (success)
SYM_ERR="✗"       # X mark (error)
SYM_WARN="⚠"      # Warning triangle
SYM_INFO="●"      # Bullet (info)
SYM_ARROW="➜"     # Arrow
SYM_KEY="◆"       # Diamond (key/secure)
SYM_STAR="★"      # Star
SYM_DOT="·"       # Middle dot

# ==================== BOX FUNCTIONS ====================

# Top border: ╔═══════════════╗
box_top() {
    local width=${1:-$BOX_WIDTH}
    printf "╔"
    printf '═%.0s' $(seq 1 $width)
    printf "╗\n"
}

# Bottom border: ╚═══════════════╝
box_bottom() {
    local width=${1:-$BOX_WIDTH}
    printf "╚"
    printf '═%.0s' $(seq 1 $width)
    printf "╝\n"
}

# Separator: ╠═══════════════╣
box_sep() {
    local width=${1:-$BOX_WIDTH}
    printf "╠"
    printf '═%.0s' $(seq 1 $width)
    printf "╣\n"
}

# Empty line: ║               ║
box_empty() {
    local width=${1:-$BOX_WIDTH}
    printf "║"
    printf ' %.0s' $(seq 1 $width)
    printf "║\n"
}

# Centered text: ║    text    ║
box_center() {
    local text="$1"
    local width=${2:-$BOX_WIDTH}
    local text_len=${#text}
    local total_pad=$((width - text_len))
    
    if [ $total_pad -lt 0 ]; then
        printf "║%s║\n" "${text:0:$width}"
        return
    fi
    
    local left_pad=$((total_pad / 2))
    local right_pad=$((total_pad - left_pad))
    
    printf "║"
    printf ' %.0s' $(seq 1 $left_pad)
    printf "%s" "$text"
    printf ' %.0s' $(seq 1 $right_pad)
    printf "║\n"
}

# Left-aligned text: ║ text          ║
box_left() {
    local text="$1"
    local width=${2:-$BOX_WIDTH}
    local text_len=${#text}
    local padding=$((width - text_len))
    
    if [ $padding -lt 0 ]; then
        printf "║%s║\n" "${text:0:$width}"
        return
    fi
    
    printf "║%s" "$text"
    printf ' %.0s' $(seq 1 $padding)
    printf "║\n"
}

# ==================== QUICK BOX ====================

# Print a simple centered box with title
# Usage: quick_box "Title" "line1" "line2" ...
quick_box() {
    local title="$1"
    shift
    
    box_top
    box_center "$title"
    
    if [ $# -gt 0 ]; then
        box_sep
        for line in "$@"; do
            box_center "$line"
        done
    fi
    
    box_bottom
}

# ==================== STATUS MESSAGES ====================

# Success message: ✓ text
msg_ok() {
    echo -e "${GREEN}${SYM_OK}${NC} $1"
}

# Error message: ✗ text
msg_err() {
    echo -e "${RED}${SYM_ERR}${NC} $1"
}

# Warning message: ⚠ text
msg_warn() {
    echo -e "${YELLOW}${SYM_WARN}${NC} $1"
}

# Info message: ● text
msg_info() {
    echo -e "${BLUE}${SYM_INFO}${NC} $1"
}

# Key/secure message: ◆ text
msg_key() {
    echo -e "${CYAN}${SYM_KEY}${NC} $1"
}

# ==================== HEADER ====================

# Print a standard LVE header
lve_header() {
    local title="$1"
    echo ""
    box_top
    box_center "LVE Chain ${SYM_DOT} $title"
    box_bottom
    echo ""
}
