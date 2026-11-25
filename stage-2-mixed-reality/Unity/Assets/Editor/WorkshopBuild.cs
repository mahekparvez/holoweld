using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEditor.XR.OpenXR.Features;
using UnityEngine;
using UnityEngine.XR.Management;
using UnityEngine.XR.OpenXR;

namespace HoloWeld.EditorTools
{
    public static class WorkshopBuild
    {
        private const string Generated="Assets/HoloWeldGenerated";
        private const string ScenePath=Generated+"/Workshop.unity";

        [InitializeOnLoadMethod]
        private static void FirstImport()
        {
            if(Application.isBatchMode)return;
            EditorApplication.delayCall+=()=>{
                if(!File.Exists(ScenePath)) OpenWorkshop();
            };
        }

        public static void PrepareBatch() => Prepare();

        [MenuItem("HOLOWELD/Open Workshop")]
        public static void OpenWorkshop()
        {
            Prepare();
            if(EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                EditorSceneManager.OpenScene(ScenePath);
        }

        private static void Prepare()
        {
            Directory.CreateDirectory(Generated+"/Resources");
            AssetDatabase.Refresh();
            MaterialAsset("HoloWeldSurface","Standard");
            MaterialAsset("HoloWeldSparks","Legacy Shaders/Particles/Additive",false);
            if(!File.Exists(ScenePath)){
                var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
                new GameObject("HOLOWELD Workshop").AddComponent<Workshop>();
                EditorSceneManager.SaveScene(scene,ScenePath);
            }
            EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(ScenePath,true)};
            PlayerSettings.productName="HOLOWELD";
            PlayerSettings.companyName="HOLOWELD";
            PlayerSettings.bundleVersion="0.2.0";
            var settings=AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset").FirstOrDefault();
            if(settings!=null){
                var serialized=new SerializedObject(settings);
                var handling=serialized.FindProperty("activeInputHandler");
                if(handling!=null && handling.intValue!=2){
                    handling.intValue=2;
                    serialized.ApplyModifiedPropertiesWithoutUndo();
                    Debug.Log("HOLOWELD enabled both input backends. Restart Unity if requested.");
                }
            }
            AssetDatabase.SaveAssets();
        }

        private static void MaterialAsset(string name,string shaderName,bool required=true)
        {
            var path=Generated+"/Resources/"+name+".mat";
            if(AssetDatabase.LoadAssetAtPath<Material>(path)!=null)return;
            var shader=Shader.Find(shaderName);
            if(shader!=null)AssetDatabase.CreateAsset(new Material(shader),path);
            else if(required)throw new InvalidOperationException("Missing workshop shader: "+shaderName);
        }

        [MenuItem("HOLOWELD/Export HoloLens UWP Solution")]
        public static void ExportUwp()
        {
            if(Application.platform!=RuntimePlatform.WindowsEditor)
                throw new PlatformNotSupportedException("Export HoloLens UWP on Windows. Use Play mode for the local workshop preview.");
            if(!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WSA,BuildTarget.WSAPlayer))
                throw new InvalidOperationException("Install Universal Windows Platform Build Support for the pinned Unity editor.");
            Prepare();
            const BuildTargetGroup target=BuildTargetGroup.WSA;
            if(!EditorBuildSettings.TryGetConfigObject(XRGeneralSettings.k_SettingsKey,out XRGeneralSettingsPerBuildTarget all)){
                Directory.CreateDirectory(Generated);
                all=ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                AssetDatabase.CreateAsset(all,Generated+"/XRGeneralSettings.asset");
                EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey,all,true);
            }
            if(!all.HasManagerSettingsForBuildTarget(target))all.CreateDefaultManagerSettingsForBuildTarget(target);
            var general=all.SettingsForBuildTarget(target);
            var manager=general.Manager;
            if(!manager.activeLoaders.Any(loader=>loader is OpenXRLoader) &&
                !XRPackageMetadataStore.AssignLoader(manager,typeof(OpenXRLoader).FullName,target))
                throw new InvalidOperationException("Unity could not assign the OpenXR loader.");
            general.InitManagerOnStart=true;
            EditorUtility.SetDirty(all);EditorUtility.SetDirty(general);EditorUtility.SetDirty(manager);

            FeatureHelpers.RefreshFeatures(target);
            foreach(var id in new[]{"com.microsoft.openxr.feature.hololens","com.microsoft.openxr.feature.handtracking",
                                   "com.unity.openxr.feature.input.handtracking"}){
                var feature=FeatureHelpers.GetFeatureWithIdForBuildTarget(target,id);
                if(feature==null)throw new InvalidOperationException("OpenXR feature missing: "+id);
                feature.enabled=true;
                EditorUtility.SetDirty(feature);
            }
            var xr=OpenXRSettings.GetSettingsForBuildTargetGroup(target);
            xr.renderMode=OpenXRSettings.RenderMode.SinglePassInstanced;
            xr.depthSubmissionMode=OpenXRSettings.DepthSubmissionMode.Depth16Bit;
            EditorUtility.SetDirty(xr);
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WSAPlayer,false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WSAPlayer,new[]{UnityEngine.Rendering.GraphicsDeviceType.Direct3D11});
            PlayerSettings.WSA.packageName="HOLOWELD";
            PlayerSettings.WSA.applicationDescription="HOLOWELD native simulated welding workshop";
            PlayerSettings.WSA.tileShortName="HOLOWELD";
            PlayerSettings.WSA.transparentSwapchain=true;
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.WindowsStoreApps,ScriptingImplementation.IL2CPP);
            EditorUserBuildSettings.wsaArchitecture="ARM64";
            EditorUserBuildSettings.wsaUWPBuildType=WSAUWPBuildType.D3D;
            EditorUserBuildSettings.wsaMinUWPSDK="10.0.19041.0";
            AssetDatabase.SaveAssets();

            var path=Path.GetFullPath("Builds/UWP");
            Directory.CreateDirectory(path);
            var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{
                scenes=new[]{ScenePath},locationPathName=path,target=BuildTarget.WSAPlayer,
                targetGroup=target,options=BuildOptions.None,
            });
            if(report.summary.result!=UnityEditor.Build.Reporting.BuildResult.Succeeded)
                throw new InvalidOperationException("UWP export failed. Inspect the Unity build log.");
            Debug.Log("HOLOWELD UWP solution exported to "+path);
        }
    }
}
