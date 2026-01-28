#!/bin/bash
# =========================================================
# LVE Chain — Node Update Script v2.1.0
# =========================================================
# Run: ./update_node.sh
# =========================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source box utilities if available
if [ -f "$SCRIPT_DIR/runners/lib/box.sh" ]; then
    source "$SCRIPT_DIR/runners/lib/box.sh"
else
    # Fallback functions
    msg_ok() { echo "✅ $1"; }
    msg_err() { echo "❌ $1"; }
    msg_info() { echo "● $1"; }
    msg_warn() { echo "⚠ $1"; }
    lve_header() {
        echo ""
        echo "╭──────────────────────────────────────────────╮"
        echo "│     🔗 LVE Chain · $1"
        echo "╰──────────────────────────────────────────────╯"
        echo ""
    }
    quick_box() {
        echo "╭──────────────────────────────────────────────╮"
        echo "│  $1"
        shift
        for line in "$@"; do
            echo "│  $line"
        done
        echo "╰──────────────────────────────────────────────╯"
    }
fi

lve_header "Node Update"

# Check if git is available
if ! command -v git &> /dev/null; then
    msg_err "Git is not installed"
    exit 1
fi

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    msg_err "Not a git repository. Run from the project root."
    exit 1
fi

msg_info "📥 Pulling latest changes..."
git pull

if [ $? -ne 0 ]; then
    msg_err "Git pull failed. Resolve conflicts and try again."
    exit 1
fi

msg_info "📦 Installing dependencies..."
npm install

msg_info "🔨 Building..."
npm run build

if [ $? -ne 0 ]; then
    msg_err "Build failed. Check for errors above."
    exit 1
fi

echo ""
quick_box "✅ Update Complete!" \
    "" \
    "Restart your node using runners:" \
    "" \
    "  ./runners/genesis-bootstrap/start.sh  (Genesis)" \
    "  ./runners/validator/start.sh          (Validator)" \
    "  ./runners/full/start.sh               (Full node)" \
    "  ./runners/rpc/start.sh                (RPC + API)" \
    "  ./runners/light/start.sh              (Light node)"
echo ""

# Auto-restart PM2 if running
PM2_NAME="${PM2_NAME:-lve-genesis}"
if command -v pm2 &> /dev/null; then
    if pm2 list 2>/dev/null | grep -q "$PM2_NAME"; then
        msg_info "🔄 Restarting $PM2_NAME via PM2..."
        pm2 restart "$PM2_NAME"
        msg_ok "Node restarted!"
        echo ""
        pm2 logs "$PM2_NAME" --lines 10 --nostream
    fi
fi
