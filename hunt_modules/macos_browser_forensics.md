---
id: macos_browser_forensics
name: macOS Browser Forensics
description: Analyze browser history, extensions, downloads, and local storage across Safari, Chrome, and Firefox for indicators of compromise
os_types: [macos]
tags: [collection, T1185, T1539, T1113]
severity_hint: medium
---

## Steps

### check_safari_history
**description**: Query Safari browsing history database for recent entries
**command**: `sqlite3 ~/Library/Safari/History.db "SELECT datetime(visit_time + 978307200, 'unixepoch', 'localtime') as visit_date, url FROM history_visits INNER JOIN history_items ON history_visits.history_item = history_items.id ORDER BY visit_time DESC LIMIT 30" 2>/dev/null`
**timeout**: 15
**requires_sudo**: false

### check_chrome_history
**description**: Query Chrome browsing history for recent entries
**command**: `CHROME_HIST=~/Library/Application\ Support/Google/Chrome/Default/History; cp "$CHROME_HIST" /tmp/chrome_hist_copy 2>/dev/null; sqlite3 /tmp/chrome_hist_copy "SELECT datetime(last_visit_time/1000000-11644473600, 'unixepoch', 'localtime') as visit_date, url, title FROM urls ORDER BY last_visit_time DESC LIMIT 30" 2>/dev/null; rm -f /tmp/chrome_hist_copy`
**timeout**: 15
**requires_sudo**: false

### check_firefox_history
**description**: Query Firefox browsing history for recent entries
**command**: `FF_PROFILE=$(find ~/Library/Application\ Support/Firefox/Profiles -maxdepth 1 -name "*.default*" -type d 2>/dev/null | head -1); if [ -n "$FF_PROFILE" ]; then cp "$FF_PROFILE/places.sqlite" /tmp/ff_places_copy 2>/dev/null; sqlite3 /tmp/ff_places_copy "SELECT datetime(last_visit_date/1000000, 'unixepoch', 'localtime') as visit_date, url FROM moz_places WHERE last_visit_date IS NOT NULL ORDER BY last_visit_date DESC LIMIT 30" 2>/dev/null; rm -f /tmp/ff_places_copy; fi`
**timeout**: 15
**requires_sudo**: false

### check_browser_extensions
**description**: List installed browser extensions for Safari, Chrome, and Firefox
**command**: `echo "=== Safari Extensions ==="; pluginkit -mA 2>/dev/null | grep -i safari | head -10; ls -la ~/Library/Safari/Extensions/ 2>/dev/null; echo "=== Chrome Extensions ==="; for ext in ~/Library/Application\ Support/Google/Chrome/Default/Extensions/*/; do manifest=$(find "$ext" -name manifest.json -maxdepth 2 2>/dev/null | head -1); if [ -n "$manifest" ]; then echo "$(python3 -c "import json;d=json.load(open('$manifest'));print(d.get('name','unknown'))" 2>/dev/null): $ext"; fi; done | head -15; echo "=== Firefox Extensions ==="; find ~/Library/Application\ Support/Firefox/Profiles -name "extensions.json" -exec python3 -c "import json,sys;d=json.load(open(sys.argv[1]));[print(a.get('defaultLocale',{}).get('name','') or a.get('id','')) for a in d.get('addons',[])]" {} \; 2>/dev/null | head -15`
**timeout**: 20
**requires_sudo**: false

### check_browser_downloads
**description**: Check recent downloads across all major browsers
**command**: `echo "=== Safari Downloads ==="; plutil -p ~/Library/Safari/Downloads.plist 2>/dev/null | head -20; echo "=== Chrome Downloads ==="; CHROME_HIST=~/Library/Application\ Support/Google/Chrome/Default/History; cp "$CHROME_HIST" /tmp/chrome_dl_copy 2>/dev/null; sqlite3 /tmp/chrome_dl_copy "SELECT datetime(start_time/1000000-11644473600, 'unixepoch', 'localtime'), target_path, tab_url FROM downloads ORDER BY start_time DESC LIMIT 20" 2>/dev/null; rm -f /tmp/chrome_dl_copy`
**timeout**: 15
**requires_sudo**: false

### check_browser_cookies
**description**: Check browser cookie databases for size and recent modification indicating potential session theft
**command**: `echo "=== Safari Cookies ==="; ls -la ~/Library/Cookies/Cookies.binarycookies 2>/dev/null; echo "=== Chrome Cookies ==="; ls -la ~/Library/Application\ Support/Google/Chrome/Default/Cookies 2>/dev/null; stat -f '%Sm %z %N' ~/Library/Application\ Support/Google/Chrome/Default/Cookies 2>/dev/null; echo "=== Firefox Cookies ==="; find ~/Library/Application\ Support/Firefox/Profiles -name "cookies.sqlite" -exec ls -la {} \; 2>/dev/null`
**timeout**: 10
**requires_sudo**: false

### check_browser_local_storage
**description**: Inspect browser local storage and IndexedDB for suspicious data stores
**command**: `echo "=== Chrome Local Storage ==="; ls -la ~/Library/Application\ Support/Google/Chrome/Default/Local\ Storage/leveldb/ 2>/dev/null | tail -20; du -sh ~/Library/Application\ Support/Google/Chrome/Default/Local\ Storage/ 2>/dev/null; echo "=== Safari Local Storage ==="; ls -la ~/Library/Safari/LocalStorage/ 2>/dev/null | tail -20; echo "=== Firefox Storage ==="; find ~/Library/Application\ Support/Firefox/Profiles -name "webappsstore.sqlite" -exec ls -la {} \; 2>/dev/null`
**timeout**: 10
**requires_sudo**: false
