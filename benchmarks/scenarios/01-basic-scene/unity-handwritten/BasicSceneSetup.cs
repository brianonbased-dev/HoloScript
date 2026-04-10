using UnityEngine;
using UnityEngine.XR.Interaction.Toolkit;

/// <summary>
/// Hand-written Unity C# baseline for Scenario 1: Basic VR Scene
///
/// Purpose: Performance comparison baseline for HoloScript-generated code
/// Implements: Ground plane + grabbable cube with physics
///
/// Expected Performance: 90 FPS @ Quest 2
/// </summary>
public class BasicSceneSetup : MonoBehaviour
{
    void Start()
    {
        SetupEnvironment();
        CreateGround();
        CreateGrabbableCube();
    }

    /// <summary>
    /// Setup environment: procedural sky and day lighting
    /// </summary>
    void SetupEnvironment()
    {
        // Procedural skybox
        RenderSettings.skybox = Resources.Load<Material>("Skyboxes/ProceduralSky");

        // Day lighting - directional light
        GameObject lightObj = new GameObject("Directional Light");
        Light light = lightObj.AddComponent<Light>();
        light.type = LightType.Directional;
        light.color = new Color(1f, 0.95f, 0.84f); // Warm daylight
        light.intensity = 1.0f;
        light.shadows = LightShadows.Soft;
        lightObj.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

        // Ambient lighting
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Skybox;
        RenderSettings.ambientIntensity = 1.0f;
    }

    /// <summary>
    /// Create ground plane: 100x100 static physics collider
    /// </summary>
    void CreateGround()
    {
        GameObject ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
        ground.name = "Ground";

        // Scale: 100x100 (plane primitive is 10x10, so scale by 10)
        ground.transform.localScale = new Vector3(10f, 1f, 10f);
        ground.transform.position = Vector3.zero;

        // Static physics
        Rigidbody rb = ground.AddComponent<Rigidbody>();
        rb.isKinematic = true; // Static body
        rb.useGravity = false;

        // Material
        Renderer renderer = ground.GetComponent<Renderer>();
        Material groundMat = new Material(Shader.Find("Standard"));
        groundMat.color = new Color(0.4f, 0.6f, 0.4f); // Grass green
        renderer.material = groundMat;
    }

    /// <summary>
    /// Create grabbable cube: dynamic physics + XR interaction
    /// </summary>
    void CreateGrabbableCube()
    {
        GameObject cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
        cube.name = "Cube";

        // Position: 1 meter above ground
        cube.transform.position = new Vector3(0f, 1f, 0f);
        cube.transform.localScale = Vector3.one; // 1x1x1 meter

        // Dynamic physics
        Rigidbody rb = cube.AddComponent<Rigidbody>();
        rb.mass = 1.0f;
        rb.useGravity = true;
        rb.drag = 0.5f;
        rb.angularDrag = 0.5f;

        // XR Grab Interactable (Unity XR Interaction Toolkit)
        XRGrabInteractable grabInteractable = cube.AddComponent<XRGrabInteractable>();
        grabInteractable.movementType = XRBaseInteractable.MovementType.VelocityTracking;
        grabInteractable.throwOnDetach = true;
        grabInteractable.throwSmoothingDuration = 0.25f;

        // Material
        Renderer renderer = cube.GetComponent<Renderer>();
        Material cubeMat = new Material(Shader.Find("Standard"));
        cubeMat.color = new Color(0.8f, 0.2f, 0.2f); // Red
        cubeMat.SetFloat("_Metallic", 0.5f);
        cubeMat.SetFloat("_Glossiness", 0.7f);
        renderer.material = cubeMat;
    }
}
