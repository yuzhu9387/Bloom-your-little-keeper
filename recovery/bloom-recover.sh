#!/bin/bash
# Bloom data recovery — restore todo cards you accidentally closed.
# Run once:   sudo bash recovery/bloom-recover.sh   (from the Bloom_note_keeper repo root)
#
# It finds the newest Time Machine snapshot that still has the closed "backlog"
# card, backs up your CURRENT data, then ADDS BACK only the cards that are
# missing now (closed/deleted). It never overwrites cards you still have.

set -u
HOME_DIR=/Users/guoyuzhu
LIVE="$HOME_DIR/Library/Application Support/architect-desktop-app/data.json"
REL="Users/guoyuzhu/Library/Application Support/architect-desktop-app/data.json"
MNT=/tmp/bloom_snap
NODE=/usr/local/bin/node

if [ "$(id -u)" != "0" ]; then echo "Please run with sudo:  sudo bash recovery/bloom-recover.sh"; exit 1; fi
[ -x "$NODE" ] || NODE=$(command -v node)

DEV=$(diskutil info /System/Volumes/Data | awk -F: '/Device Node/{gsub(/ /,"",$2);print $2}')
mkdir -p "$MNT"
echo "Data device: $DEV"
echo "Looking for the newest snapshot that still has the closed card(s)..."

BEST=""; BESTFILE=""
for SNAP in $(tmutil listlocalsnapshots / | grep 'com.apple.TimeMachine' | sort -r); do
  umount "$MNT" 2>/dev/null
  mount_apfs -o ro,nobrowse -s "$SNAP" "$DEV" "$MNT" 2>/dev/null || continue
  F="$MNT/$REL"
  if [ -f "$F" ] && grep -iqE "小蜜|backlog|sales matching" "$F"; then
    BEST="$SNAP"; BESTFILE="$F"; break
  fi
  umount "$MNT" 2>/dev/null
done

if [ -z "$BEST" ]; then
  echo "❌ No snapshot still contained the backlog card. Nothing to recover from snapshots."
  umount "$MNT" 2>/dev/null; rmdir "$MNT" 2>/dev/null; exit 1
fi
echo "✅ Recovery source: $BEST"

cp -p "$LIVE" "$HOME_DIR/Desktop/bloom-data-before-recovery.json"
echo "Backed up current data -> ~/Desktop/bloom-data-before-recovery.json"

"$NODE" -e '
const fs=require("fs");
const [livePath, snapPath] = [process.argv[1], process.argv[2]];
const live=JSON.parse(fs.readFileSync(livePath,"utf8"));
const snap=JSON.parse(fs.readFileSync(snapPath,"utf8"));
const liveIds=new Set(live.widgets.map(w=>w.id));
const recovered=snap.widgets.filter(w=>!liveIds.has(w.id));
if(recovered.length===0){ console.log("Nothing missing — your current data already has every card from that snapshot."); process.exit(0); }
recovered.forEach(w=>live.widgets.push(w));
fs.writeFileSync(livePath, JSON.stringify(live,null,2));
console.log("Recovered "+recovered.length+" card(s) and added them back:");
recovered.forEach(w=>{
  let info="  • "+w.type+(w.data&&w.data.title?" “"+w.data.title+"”":"");
  if(w.type==="todo"){
    const n=w.data.nodes, of=w.data.folders, it=w.data.items;
    if(Array.isArray(n)){ info+=" — folders: "+(n.filter(x=>x.type==="folder").map(x=>x.name).join(", ")||"(none)")+"; loose tasks: "+n.filter(x=>x.type==="todo").length; }
    else if(Array.isArray(of)){ info+=" — folders: "+of.map(x=>x.name).join(", ")+"; items: "+((it||[]).length); }
  }
  console.log(info);
});
' "$LIVE" "$BESTFILE"

# keep the file owned by the user (we wrote it as root)
chown "$(stat -f %Su "$HOME_DIR")":"$(stat -f %Sg "$HOME_DIR")" "$LIVE"

umount "$MNT" 2>/dev/null; rmdir "$MNT" 2>/dev/null
echo ""
echo "✅ Done. Now reopen Bloom — the recovered card(s) should be back."
echo "   (If anything looks wrong, your pre-recovery data is at ~/Desktop/bloom-data-before-recovery.json)"
