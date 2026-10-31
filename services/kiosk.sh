#!/bin/bash
#/usr/local/bin/kiosk.sh
URL="http://192.168.4.1"

# Wait for the desktop session (Wayland socket or X display)
for i in $(seq 1 60); do
  [ -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ] || [ -S /tmp/.X11-unix/X0 ] && break
  sleep 1
done

# Wait for the web server to answer (up to ~2 minutes)
for i in $(seq 1 60); do
  curl -s -o /dev/null --max-time 2 "$URL" && break
  sleep 2
done

# Package is "chromium" on newer images, "chromium-browser" on older ones
BROWSER=$(command -v chromium || command -v chromium-browser)

exec "$BROWSER" \
  --kiosk "$URL" \
  --incognito \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --disable-features=Translate \
  --check-for-update-interval=31536000 \
  --password-store=basic \
  --ozone-platform-hint=auto
