using System;
using System.Collections.Generic;
using System.IO;
#if UNITY_WSA && !UNITY_EDITOR
using Microsoft.MixedReality.OpenXR;
using UnityEngine.XR;
#endif
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;

namespace HoloWeld
{
    public sealed class Workshop : MonoBehaviour
    {
        [Serializable] private class Shape { public float[] pos, quat; public string file; }
        [Serializable] private class Link
        {
            public string name, joint;
            public float[] pos, quat, axis, limits;
            public Shape[] meshes;
            public Link[] children;
        }
        [Serializable] private class Frame { public float[] q, tip; public float length; public bool arc; public int beadCount; }
        [Serializable] private class Bead { public float[] xyz; }
        [Serializable] private class Pass { public string program; public Frame[] rows; public Bead[] bead; }
        [Serializable] private class PassSet { public int rate; public Pass[] passes; }
        private struct Joint
        {
            public Transform frame;
            public Quaternion rest;
            public Vector3 axis;
            public Vector2 limits;
        }

        private readonly List<Joint> joints = new List<Joint>();
        private readonly Dictionary<string, Mesh> meshes = new Dictionary<string, Mesh>();
#if UNITY_WSA && !UNITY_EDITOR
        private readonly List<XRInputSubsystem> inputs = new List<XRInputSubsystem>();
        private readonly HandJointLocation[] hand = new HandJointLocation[HandTracker.JointCount];
#endif
        private Transform workshop, cell, gripper, electrode, deposited;
        private Camera viewer;
        private Light arcLight;
        private ParticleSystem sparks;
        private TextMesh sign;
        private Material steel, charcoal, amber, rubber, beadMetal;
        private PassSet programs;
        private Pass active;
        private float seconds, yaw, pitch;
        private int beadsShown, nextPass;
        private bool stopped;
#if UNITY_WSA && !UNITY_EDITOR
        private bool placed, pinch, canPinch, leftPinch, floorAttempted;
#endif
        private string message;
        private static readonly Vector3 ElectrodeBase = new Vector3(.022f,0,-.113f);
        private static readonly Vector3 ElectrodeAxis = new Vector3(-.76f,0,-.65f).normalized;
        private static Vector3 V(float[] p) => new Vector3(p[0],p[1],p[2]);
        private static Quaternion Q(float[] q) => new Quaternion(q[1],q[2],q[3],q[0]).normalized;
#if UNITY_WSA && !UNITY_EDITOR
        private const bool Headset = true;
#else
        private const bool Headset = false;
#endif

        private void Awake()
        {
            steel = Metal(0x87939B,.65f);
            charcoal = Metal(0x303C46,.34f);
            amber = Metal(0xD99533,.22f);
            rubber = Metal(0x20242A,.05f);
            beadMetal = Metal(0x686159,.7f);
            programs = JsonUtility.FromJson<PassSet>(Required("SO101/Passes").text);
            viewer = new GameObject("Head camera").AddComponent<Camera>();
            viewer.tag = "MainCamera";
            viewer.nearClipPlane=.035f;
            viewer.farClipPlane=30;
            viewer.clearFlags=CameraClearFlags.SolidColor;
            viewer.backgroundColor=Headset ? Color.clear : new Color(.13f,.18f,.22f);
            if (!Headset)
            {
                viewer.transform.position=new Vector3(.88f,1.45f,1.05f);
                viewer.transform.LookAt(new Vector3(.28f,.91f,0));
                var angles=viewer.transform.eulerAngles;
                yaw=angles.y;pitch=angles.x;
            }
            var key = new GameObject("Workshop lighting").AddComponent<Light>();
            key.type=LightType.Directional;key.intensity=1.35f;
            key.transform.rotation=Quaternion.Euler(48,-32,0);
            RenderSettings.ambientLight=new Color(.6f,.66f,.72f);
            workshop=Group("Workshop",transform);
            cell=Group("Welding cell",workshop);
            BuildRoom();
            BuildCell();
            var baseFrame=Group("SO-101 mount",cell,new Vector3(0,.836f,0));
            baseFrame.localRotation=Quaternion.Euler(-90,0,0);
            BuildLink(JsonUtility.FromJson<Link>(Required("SO101/Model").text),baseFrame);
            Tube("Holder",gripper,new Vector3(0,0,-.075f),new Vector3(-.01f,0,-.126f),.014f,rubber);
            Tube("Holder jaws",gripper,new Vector3(-.01f,0,-.126f),ElectrodeBase,.011f,charcoal);
            electrode=Primitive("Consumable",PrimitiveType.Cylinder,gripper,Vector3.zero,Vector3.one,steel);
            electrode.localRotation=Quaternion.FromToRotation(Vector3.up,ElectrodeAxis);
            deposited=Group("Bead",cell);
            arcLight=Group("Arc light",cell).gameObject.AddComponent<Light>();
            arcLight.type=LightType.Point;arcLight.color=new Color(.52f,.78f,1);
            arcLight.range=.21f;arcLight.shadows=LightShadows.None;
            sparks=BuildSparks();
            ResetCell();
            workshop.gameObject.SetActive(!Headset);
            if (Headset)
            {
                var text=new GameObject("Placement instructions").AddComponent<TextMesh>();
                text.transform.SetParent(viewer.transform,false);
                text.transform.localPosition=new Vector3(0,-.12f,1.25f);
                text.characterSize=.034f;text.fontSize=42;text.anchor=TextAnchor.MiddleCenter;
                text.text="HOLOWELD\nOpen your hand, then pinch to place";
                placementPrompt=text.gameObject;
            }
        }

        private GameObject placementPrompt;
        private static TextAsset Required(string path) => Resources.Load<TextAsset>(path)
            ?? throw new InvalidDataException("Missing HOLOWELD resource: "+path);

        private static Material Metal(int rgb,float metal)
        {
            var color=new Color(((rgb>>16)&255)/255f,((rgb>>8)&255)/255f,(rgb&255)/255f);
            var material=new Material(Resources.Load<Material>("HoloWeldSurface")) {color=color};
            material.SetFloat("_Metallic",metal);
            material.SetFloat("_Glossiness",.38f);
            return material;
        }
        private static Transform Group(string label,Transform parent,Vector3 local=default)
        {
            var item=new GameObject(label).transform;
            item.SetParent(parent,false); item.localPosition=local;
            return item;
        }
        private static Transform Primitive(string label,PrimitiveType shape,Transform parent,Vector3 local,Vector3 size,Material material)
        {
            var item=GameObject.CreatePrimitive(shape);
            item.name=label;item.transform.SetParent(parent,false);
            item.transform.localPosition=local;item.transform.localScale=size;
            item.GetComponent<MeshRenderer>().sharedMaterial=material;
            Destroy(item.GetComponent<Collider>());
            return item.transform;
        }
        private static void Box(string name,Transform parent,float x,float y,float z,float w,float h,float d,Material mat)
        {
            Primitive(name,PrimitiveType.Cube,parent,new Vector3(x,y,z),new Vector3(w,h,d),mat);
        }
        private static void Tube(string name,Transform parent,Vector3 a,Vector3 b,float radius,Material mat)
        {
            var delta=b-a;
            var obj=Primitive(name,PrimitiveType.Cylinder,parent,(a+b)*.5f,
                new Vector3(radius*2,delta.magnitude*.5f,radius*2),mat);
            obj.localRotation=Quaternion.FromToRotation(Vector3.up,delta);
        }

        private void BuildRoom()
        {
            var floor=Metal(0x515D64,.08f);
            Box("Concrete floor",workshop,.7f,-.052f,0,5.6f,.10f,4.8f,floor);
            Box("Workshop wall",workshop,.6f,1.15f,-1.15f,4.6f,2.3f,.07f,charcoal);
            for(int i=-11;i<19;i++)
                Box("Wall rib",workshop,i*.145f,1.15f,-1.09f,.025f,2.3f,.035f,steel);
            for(int i=0;i<14;i++)
                Box("Cell boundary",workshop,-.45f+i*.12f,.002f,.77f,.079f,.004f,.035f,amber);
            Box("Tool cabinet",workshop,-.69f,.43f,-.73f,.43f,.85f,.37f,charcoal);
            for(int i=0;i<5;i++){
                Box("Drawer",workshop,-.69f,.13f+i*.14f,-.535f,.39f,.12f,.015f,steel);
                Box("Pull",workshop,-.69f,.15f+i*.14f,-.514f,.13f,.015f,.021f,amber);
            }
        }

        private void BuildCell()
        {
            Box("Welding bench",cell,.354f,.814f,0,.83f,.041f,.58f,steel);
            foreach(var x in new[]{.006f,.695f})foreach(var z in new[]{-.227f,.227f})
                Box("Bench leg",cell,x,.39f,z,.052f,.77f,.052f,charcoal);
            Box("Bench shelf",cell,.35f,.27f,0,.73f,.029f,.49f,charcoal);
            foreach(var z in new[]{-.075f,.075f})
                Box("Coupon riser",cell,.262f,.843f,z,.146f,.016f,.043f,charcoal);
            foreach(var z in new[]{-.05f,.05f})
                Box("8 mm steel coupon",cell,.262f,.855f,z,.154f,.008f,.0975f,steel);
            foreach(var x in new[]{.211f,.323f})foreach(var z in new[]{-.087f,.087f}){
                Box("Coupon clamp",cell,x,.854f,z,.027f,.033f,.024f,amber);
                Tube("Adjustment screw",cell,new Vector3(x,.86f,z),new Vector3(x,.89f,z),.003f,steel);
            }
            Box("Power unit",cell,.87f,.55f,-.23f,.234f,.173f,.216f,amber);
            Box("Power unit front",cell,.87f,.55f,-.115f,.226f,.165f,.013f,charcoal);
            Vector3[] ground={new Vector3(.916f,.50f,-.10f),new Vector3(.9f,.13f,.09f),
                new Vector3(.68f,.14f,.24f),new Vector3(.52f,.32f,.246f),new Vector3(.332f,.836f,.06f)};
            for(int i=1;i<ground.Length;i++) Tube("Work lead",cell,ground[i-1],ground[i],.006f,rubber);
            sign=Group("Instruction board",cell,new Vector3(.402f,1.11f,-.28f)).gameObject.AddComponent<TextMesh>();
            sign.transform.localRotation=Quaternion.Euler(0,180,0);
            sign.characterSize=.025f;sign.fontSize=48;sign.anchor=TextAnchor.MiddleCenter;
            sign.color=new Color(.92f,.97f,1);
        }

        private void BuildLink(Link data,Transform parent)
        {
            var frame=Group(data.name,parent,V(data.pos));
            frame.localRotation=Q(data.quat);
            if(data.name=="gripper")gripper=frame;
            if(!string.IsNullOrEmpty(data.joint) && data.joint!="gripper")
                joints.Add(new Joint {frame=frame,rest=frame.localRotation,axis=V(data.axis),
                    limits=new Vector2(data.limits[0],data.limits[1])});
            foreach(var visual in data.meshes){
                string file=Path.GetFileNameWithoutExtension(visual.file);
                if(!meshes.TryGetValue(file,out var mesh)){
                    mesh=ReadStl(file,Required("SO101/"+file).bytes);
                    meshes.Add(file,mesh);
                }
                var part=Group(file,frame,V(visual.pos));
                part.localRotation=Q(visual.quat);
                part.gameObject.AddComponent<MeshFilter>().sharedMesh=mesh;
                part.gameObject.AddComponent<MeshRenderer>().sharedMaterial=file.StartsWith("sts",StringComparison.Ordinal)?rubber:amber;
            }
            foreach(var child in data.children)BuildLink(child,frame);
        }

        private static Mesh ReadStl(string label,byte[] bytes)
        {
            using(var reader=new BinaryReader(new MemoryStream(bytes,false))){
                reader.BaseStream.Position=80;
                int count=reader.ReadInt32();
                if(count<1 || 84L+count*50L!=bytes.Length)throw new InvalidDataException("Invalid STL: "+label);
                var vertices=new Vector3[count*3];
                var normals=new Vector3[vertices.Length];
                var indices=new int[vertices.Length];
                Vector3 ReadVector()=>new Vector3(reader.ReadSingle(),reader.ReadSingle(),reader.ReadSingle());
                for(int t=0;t<count;t++){
                    var normal=ReadVector();
                    for(int k=0;k<3;k++){
                        int i=t*3+k;
                        vertices[i]=ReadVector();normals[i]=normal;indices[i]=i;
                    }
                    reader.ReadUInt16();
                }
                var mesh=new Mesh {name=label,indexFormat=IndexFormat.UInt32};
                mesh.vertices=vertices;mesh.normals=normals;mesh.triangles=indices;
                mesh.UploadMeshData(true);
                return mesh;
            }
        }

        private ParticleSystem BuildSparks()
        {
            var system=Group("Sparks",cell).gameObject.AddComponent<ParticleSystem>();
            system.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);
            var main=system.main;
            main.playOnAwake=false;main.loop=true;main.startLifetime=.22f;
            main.startSpeed=new ParticleSystem.MinMaxCurve(.25f,.8f);
            main.startSize=.003f;main.gravityModifier=.35f;main.maxParticles=80;
            main.startColor=new Color(1,.62f,.17f);
            var emission=system.emission;emission.rateOverTime=125;
            var shape=system.shape;shape.shapeType=ParticleSystemShapeType.Hemisphere;shape.radius=.003f;
            system.transform.localRotation=Quaternion.Euler(-90,0,0);
            var material=Resources.Load<Material>("HoloWeldSparks");
            if(material!=null)system.GetComponent<ParticleSystemRenderer>().sharedMaterial=material;
            return system;
        }

        private void Pose(Frame frame)
        {
            for(int i=0;i<joints.Count;i++){
                var joint=joints[i];
                float angle=Mathf.Clamp(frame.q[i],joint.limits.x,joint.limits.y)*Mathf.Rad2Deg;
                joint.frame.localRotation=joint.rest*Quaternion.AngleAxis(angle,joint.axis);
            }
            electrode.localPosition=ElectrodeBase+ElectrodeAxis*frame.length*.5f;
            electrode.localScale=new Vector3(.0034f,frame.length*.5f,.0034f);
            arcLight.transform.localPosition=V(frame.tip);
            sparks.transform.localPosition=V(frame.tip);
            Effects(frame.arc);
        }

        private void Effects(bool arc)
        {
            arcLight.intensity=arc?2.3f:0;
            if(arc && !sparks.isPlaying)sparks.Play();
            if(!arc && sparks.isEmitting)sparks.Stop(true,ParticleSystemStopBehavior.StopEmitting);
        }

        private void Say(string text)
        {
            message=text;
            sign.text="HOLOWELD  /  STAGE 2\n"+text;
        }
        private void ResetCell()
        {
            foreach(Transform bead in deposited)Destroy(bead.gameObject);
            beadsShown=0;seconds=0;active=null;stopped=false;
            Pose(programs.passes[0].rows[0]);
            Effects(false);sparks.Clear();
            Say("Ready. Pinch to run the straight or weave pass.");
        }
        private void RunOrStop()
        {
            if(stopped)return;
            if(active!=null){StopPass();return;}
            ResetCell();
            active=programs.passes[nextPass];
            nextPass=(nextPass+1)%programs.passes.Length;
            Say(active.program+" pass running");
        }
        private void StopPass()
        {
            active=null;stopped=true;Effects(false);
            Say("Stopped. Reset to start again.");
        }

        private void Update()
        {
#if UNITY_WSA && !UNITY_EDITOR
            UpdateHeadset();
#else
            UpdateDesktop();
#endif
            if(active==null)return;
            seconds+=Time.deltaTime;
            int index=Mathf.Min(active.rows.Length-1,(int)(seconds*programs.rate));
            var frame=active.rows[index];
            Pose(frame);
            while(beadsShown<frame.beadCount){
                Primitive("Bead deposit",PrimitiveType.Sphere,deposited,V(active.bead[beadsShown++].xyz),
                    new Vector3(.0041f,.0022f,.005f),beadMetal);
            }
            if(index==active.rows.Length-1){
                Say(active.program+" complete. Pinch to run the next pass.");
                active=null;Effects(false);
            }
        }

        private void UpdateDesktop()
        {
            var keyboard=Keyboard.current;
            var mouse=Mouse.current;
            if(keyboard==null)return;
            if(keyboard.spaceKey.wasPressedThisFrame)RunOrStop();
            if(keyboard.rKey.wasPressedThisFrame)ResetCell();
            if(keyboard.escapeKey.wasPressedThisFrame)StopPass();
            if(mouse!=null && mouse.rightButton.isPressed){
                var look=mouse.delta.ReadValue()*.15f;
                yaw+=look.x;pitch=Mathf.Clamp(pitch-look.y,-80,80);
                viewer.transform.rotation=Quaternion.Euler(pitch,yaw,0);
            }
            var forward=Vector3.ProjectOnPlane(viewer.transform.forward,Vector3.up).normalized;
            var right=Vector3.Cross(Vector3.up,forward);
            int z=(keyboard.wKey.isPressed?1:0)-(keyboard.sKey.isPressed?1:0);
            int x=(keyboard.dKey.isPressed?1:0)-(keyboard.aKey.isPressed?1:0);
            viewer.transform.position+=(forward*z+right*x).normalized*Time.deltaTime;
        }
        private void OnGUI()
        {
            if(Headset)return;
            GUI.Box(new Rect(16,16,480,80),"HOLOWELD · Native workshop");
            GUI.Label(new Rect(27,39,460,20),message);
            GUI.Label(new Rect(27,62,460,20),"WASD · move   Right drag · look   Space · run   R · reset   Esc · stop");
        }
#if UNITY_WSA && !UNITY_EDITOR
        private void UpdateHeadset()
        {
            if(!floorAttempted){
                SubsystemManager.GetInstances(inputs);
                foreach(var input in inputs)if(input.running){
                    input.TrySetTrackingOriginMode(TrackingOriginModeFlags.Floor);
                    floorAttempted=true;
                }
            }
            var head=InputDevices.GetDeviceAtXRNode(XRNode.Head);
            if(!head.TryGetFeatureValue(UnityEngine.XR.CommonUsages.devicePosition,out Vector3 position) ||
                !head.TryGetFeatureValue(UnityEngine.XR.CommonUsages.deviceRotation,out Quaternion rotation)){
                canPinch=false;pinch=false;leftPinch=false;
                if(active!=null)StopPass();
                return;
            }
            viewer.transform.SetPositionAndRotation(position,rotation);
            if(!Pinch(HandTracker.Right,pinch,out bool held)){
                canPinch=false;pinch=false;
                if(active!=null)StopPass();
            }else{
                if(!held)canPinch=true;
                if(held && !pinch && canPinch){
                    if(placed)RunOrStop();
                    else{
                        var forward=Vector3.ProjectOnPlane(viewer.transform.forward,Vector3.up).normalized;
                        var anchor=position+forward*1.45f;
                        bool floor=false;
                        foreach(var input in inputs)if(input.GetTrackingOriginMode()==TrackingOriginModeFlags.Floor)floor=true;
                        anchor.y=floor?0:position.y-1.55f;
                        workshop.position=anchor;
                        workshop.rotation=Quaternion.LookRotation(-forward,Vector3.up);
                        workshop.gameObject.SetActive(true);placed=true;
                        Destroy(placementPrompt);
                    }
                }
                pinch=held;
            }
            if(!placed)return;
            bool left=Pinch(HandTracker.Left,leftPinch,out bool leftHeld) && leftHeld;
            if(left && !leftPinch)ResetCell();
            leftPinch=left;
        }
        private bool Pinch(HandTracker tracker,bool held,out bool closed)
        {
            closed=false;
            if(!tracker.TryLocateHandJoints(FrameTime.OnUpdate,hand))return false;
            var thumb=hand[(int)HandJoint.ThumbTip];
            var index=hand[(int)HandJoint.IndexTip];
            if(!thumb.IsTracked||!index.IsTracked)return false;
            closed=Vector3.Distance(thumb.Pose.position,index.Pose.position)<(held?.032f:.023f);
            return true;
        }
        private void OnApplicationPause(bool paused)
        {
            if(paused && Headset){
                canPinch=false;pinch=false;leftPinch=false;
                if(active!=null)StopPass();
            }
        }
#endif
    }
}
