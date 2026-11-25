"""Extract browser model from the pinned Menagerie MJCF."""
import json
import pathlib
import xml.etree.ElementTree as ET

root = pathlib.Path('public/so101')
files = set()
def vector(node, key, default):
    return list(map(float, node.get(key, default).split()))

def body(node):
    result = dict(name=node.get('name'), pos=vector(node,'pos','0 0 0'),
                  quat=vector(node,'quat','1 0 0 0'), meshes=[], boxes=[], children=[])
    joint = node.find('joint')
    if joint is not None:
        result.update(joint=joint.get('name'), limits=vector(joint,'range',''),
                      axis=vector(joint,'axis','0 0 1'))
    for geom in node.findall('geom'):
        pose = dict(pos=vector(geom,'pos','0 0 0'), quat=vector(geom,'quat','1 0 0 0'))
        if geom.get('class') == 'visual':
            name = geom.get('mesh') + '.stl'
            files.add(name)
            result['meshes'].append(dict(**pose, file=name))
        if geom.get('type') == 'box':
            result['boxes'].append(dict(**pose, half=vector(geom,'size','')))
    result['children'] = [body(child) for child in node.findall('body') if child.get('name') != 'camera_mount']
    return result

model = body(ET.parse(root/'so101.xml').find('./worldbody/body'))
(root/'model.json').write_text(json.dumps(model, indent=2)+'\n')
missing = sorted(file for file in files if not (root/'assets'/file).is_file())
if missing:
    raise SystemExit(f"Visual meshes missing: {', '.join(missing)}")
