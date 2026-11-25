"""Check the portable Unity resource bundle without importing it into the editor."""
import json
import math
import struct
from pathlib import Path

root = Path(__file__).resolve().parents[1]
unity = root / "Unity"
resources = unity / "Assets" / "Resources" / "SO101"
model = json.loads((resources / "Model.json").read_text())
passes = json.loads((resources / "Passes.json").read_text())
manifest = json.loads((unity / "Packages" / "manifest.json").read_text())
assert (unity / "ProjectSettings" / "ProjectVersion.txt").read_text().strip() == "m_EditorVersion: 2022.3.62f1"
assert manifest["dependencies"]["com.unity.xr.openxr"] == "1.14.3"
assert manifest["dependencies"]["com.microsoft.mixedreality.openxr"] == "1.11.2"
assert passes["rate"] == 60

def norm(vector):
    length = math.sqrt(sum(a*a for a in vector))
    return tuple(a/length for a in vector)

def mul(a,b):
    w,x,y,z = a
    r,i,j,k = b
    return (w*r-x*i-y*j-z*k, w*i+x*r+y*k-z*j, w*j-x*k+y*r+z*i, w*k+x*j-y*i+z*r)

def rotate(q,v):
    return mul(mul(q,(0,*v)),(q[0],-q[1],-q[2],-q[3]))[1:]

def add(a,b):
    return tuple(x+y for x,y in zip(a,b))

parts = set()
chain = []
node = model
while True:
    chain.append(node)
    for item in node["meshes"]:
        name = Path(item["file"]).stem
        if name not in parts:
            blob = (resources / (name+".bytes")).read_bytes()
            count = struct.unpack_from("<I",blob,80)[0]
            assert count > 0 and len(blob) == 84 + 50*count, name
            parts.add(name)
    if not node["children"]:
        break
    assert len(node["children"]) == 1
    node = node["children"][0]
assert len(parts) == 13
assert "Apache License" in (resources / "LICENSE.txt").read_text()
active = [node for node in chain if node.get("joint") and node["joint"] != "gripper"]
assert len(active) == 5
axis = norm((-.76,0,-.65))
furthest = 0
for p in passes["passes"]:
    assert p["program"] in ("straight","weave")
    assert p["rows"] and p["rows"][-1]["beadCount"] == len(p["bead"])
    bins = {max(0,min(56,math.floor((b["xyz"][0]-.205)/.002))) for b in p["bead"]}
    assert len(bins) == 57
    last = None
    for row in p["rows"]:
        assert len(row["q"]) == 5 and len(row["tip"]) == 3
        assert all(lo <= value <= hi for value, (lo,hi) in zip(row["q"],[j["limits"] for j in active]))
        if last:
            assert max(abs(a-b) for a,b in zip(last,row["q"])) < .05
        last = row["q"]
        q = norm((1,-1,0,0))
        t = (0,.836,0)
        i = 0
        for node in chain:
            t = add(t,rotate(q,node["pos"]))
            q = mul(q,norm(node["quat"]))
            if node is chain[-2]:
                # The jaw child is separate and does not move the electrode.
                break_here = True
            else:
                break_here = False
            if node in active:
                angle = row["q"][i]*.5
                q = mul(q,(math.cos(angle),*(math.sin(angle)*v for v in node["axis"])))
                i += 1
            if break_here:
                break
        assert i == 5
        tip = add(t,rotate(q,add((.022,0,-.113),tuple(v*row["length"] for v in axis))))
        error = math.dist(tip,row["tip"])
        assert error < 1e-8
        furthest=max(furthest,error)
    print(f'{p["program"]}: {len(p["rows"])} frames, {len(bins)} bins, tip transform agrees')
print(f"{len(parts)} binary STL resources verified. Max tip error {furthest:.3g} meters.")
