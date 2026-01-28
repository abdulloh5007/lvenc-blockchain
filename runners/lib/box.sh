#!/bin/bash
# =========================================================
# LVE Chain — Box Formatting Utility for Bash
# =========================================================
# Uses ROUNDED corners to match TypeScript boxen output
# Usage: source this file in other scripts
# =========================================================

BOX_WIDTH=${BOX_WIDTH:-55}

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

# ==================== EMOJIS & SYMBOLS ====================

SYM_OK="✅"
SYM_ERR="❌"
SYM_WARN="⚠️"
SYM_INFO="●"
SYM_ARROW="➜"
SYM_KEY="🔐"
SYM_LOCK="🔒"
SYM_BULB="💡"
SYM_ROCKET="🚀"
SYM_FILE="📄"
SYM_CHAIN="🔗"
SYM_GEAR="⚙️"
SYM_MONEY="💰"

# ==================== BOX FUNCTIONS (ROUNDED) ====================

# Top border: ╭───────────────╮
box_top() {
    local width=${1:-$BOX_WIDTH}
    printf "${CYAN}╭"
    printf '─%.0s' $(seq 1 $width)
    printf "╮${NC}\n"
}

# Bottom border: ╰───────────────╯
box_bottom() {
    local width=${1:-$BOX_WIDTH}
    printf "${CYAN}╰"
    printf '─%.0s' $(seq 1 $width)
    printf "╯${NC}\n"
}

# Separator: ├───────────────┤
box_sep() {
    local width=${1:-$BOX_WIDTH}
    printf "${CYAN}├"
    printf '─%.0s' $(seq 1 $width)
    printf "┤${NC}\n"
}

# Empty line: │               │
box_empty() {
    local width=${1:-$BOX_WIDTH}
    printf "${CYAN}│${NC}"
    printf ' %.0s' $(seq 1 $width)
    printf "${CYAN}│${NC}\n"
}

# Centered text: │    text    │
box_center() {
    local text="$1"
    local width=${2:-$BOX_WIDTH}
    # Strip ANSI codes for length calculation
    local clean_text=$(echo -e "$text" | sed 's/\x1b\[[0-9;]*m//g')
    local text_len=${#clean_text}
    local total_pad=$((width - text_len))
    
    if [ $total_pad -lt 0 ]; then
        printf "${CYAN}│${NC}%s${CYAN}│${NC}\n" "${text:0:$width}"
        return
    fi
    
    local left_pad=$((total_pad / 2))
    local right_pad=$((total_pad - left_pad))
    
    printf "${CYAN}│${NC}"
    printf ' %.0s' $(seq 1 $left_pad)
    printf "%b" "$text"
    printf ' %.0s' $(seq 1 $right_pad)
    printf "${CYAN}│${NC}\n"
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

msg_ok() {
    echo -e "${GREEN}${SYM_OK}${NC} $1"
}

msg_err() {
    echo -e "${RED}${SYM_ERR}${NC} $1"
}

msg_warn() {
    echo -e "${YELLOW}${SYM_WARN}${NC} $1"
}

msg_info() {
    echo -e "${BLUE}${SYM_INFO}${NC} $1"
}

msg_key() {
    echo -e "${CYAN}${SYM_KEY}${NC} $1"
}

# ==================== HEADER ====================

lve_header() {
    local title="$1"
    echo ""
    box_top
    box_center "${SYM_CHAIN} LVE Chain · $title"
    box_bottom
    echo ""
}
