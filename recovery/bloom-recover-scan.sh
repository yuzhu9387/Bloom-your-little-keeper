#!/bin/bash
# Scan today's Time Machine local snapshots for the lost Bloom todo folders.
# Run with:   sudo bash recovery/bloom-recover-scan.sh   (from the Bloom_note_keeper repo root)
# It mounts each snapshot read-only, lists the todo folder names inside that
# snapshot's data.json, then unmounts. Nothing is changed.

set -u
DEV=$(diskutil info /System/Volumes/Data | awk -F: '/Device Node/{gsub(/ /,"",$2);print $2}')
REL="Users/guoyuzhu/Library/Application Support/architect-desktop-app/data.json"
MNT=/tmp/bloom_snap
mkdir -p "$MNT"

echo "Data device: $DEV"
echo "Scanning snapshots..."
echo

for SNAP in $(tmutil listlocalsnapshots / | grep 'com.apple.TimeMachine'); do
  umount "$MNT" 2>/dev/null
  if mount_apfs -o ro,nobrowse -s "$SNAP" "$DEV" "$MNT" 2>/dev/null; then
    F="$MNT/$REL"
    if [ -f "$F" ]; then
      echo "===== $SNAP ($(wc -c < "$F" | tr -d ' ') bytes) ====="
      /usr/local/bin/node -e '
        const fs=require("fs");
        try{
          const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
          const raw=fs.readFileSync(process.argv[1],"utf8");
          const has=(s)=>raw.includes(s);
          d.widgets.filter(w=>w.type==="todo").forEach((w,i)=>{
            const n=w.data.nodes, fo=w.data.folders;
            let folders=[];
            if(Array.isArray(n)) folders=n.filter(x=>x.type==="folder").map(x=>x.name);
            else if(Array.isArray(fo)) folders=fo.map(x=>x.name);
            console.log("  todo["+(w.data.title||i)+"] folders: "+(folders.join(" | ")||"(none)"));
          });
          console.log("  contains 小蜜? "+has("小蜜")+"   contains \"sales matching\"? "+/sales matching/i.test(raw));
        }catch(e){ console.log("  (parse error: "+e.message+")"); }
      ' "$F"
      echo
    fi
    umount "$MNT" 2>/dev/null
  fi
done
rmdir "$MNT" 2>/dev/null
echo "Done. Tell Claude which snapshot timestamp still lists CRM / 小蜜 / sales matching."
