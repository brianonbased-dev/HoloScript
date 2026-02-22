// BasicSceneSetup.cpp

#include "BasicSceneSetup.h"
#include "Components/StaticMeshComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SphereComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Engine/StaticMesh.h"
#include "UObject/ConstructorHelpers.h"
#include "PhysicsEngine/BodyInstance.h"
#include "MotionControllerComponent.h"
#include "GraspingHandComponent.h" // VR grabbing

ABasicSceneSetup::ABasicSceneSetup()
{
	// Set this actor to call Tick() every frame (disabled for performance)
	PrimaryActorTick.bCanEverTick = false;

	// Create root component
	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
}

void ABasicSceneSetup::BeginPlay()
{
	Super::BeginPlay();

	SetupEnvironment();
	CreateGround();
	CreateGrabbableCube();
}

void ABasicSceneSetup::SetupEnvironment()
{
	// Create directional light (sun)
	SunLight = NewObject<UDirectionalLightComponent>(this, TEXT("SunLight"));
	SunLight->SetupAttachment(RootComponent);
	SunLight->SetRelativeRotation(FRotator(-50.0f, -30.0f, 0.0f));
	SunLight->Intensity = 10.0f; // Lux for daylight
	SunLight->LightColor = FColor(255, 242, 214); // Warm daylight
	SunLight->bCastShadows = true;
	SunLight->CastShadows = true;
	SunLight->bCastDynamicShadows = true;
	SunLight->RegisterComponent();

	// Note: Procedural sky typically uses BP_Sky_Sphere blueprint in Unreal
	// For C++, we'd use UStaticMeshComponent with sky sphere mesh
	// Simplified here - in production, use Unreal's sky atmosphere component
}

void ABasicSceneSetup::CreateGround()
{
	// Create ground static mesh component
	GroundMesh = NewObject<UStaticMeshComponent>(this, TEXT("Ground"));
	GroundMesh->SetupAttachment(RootComponent);

	// Load plane mesh (Unreal's default plane primitive)
	static ConstructorHelpers::FObjectFinder<UStaticMesh> PlaneMeshAsset(
		TEXT("/Engine/BasicShapes/Plane")
	);
	if (PlaneMeshAsset.Succeeded())
	{
		GroundMesh->SetStaticMesh(PlaneMeshAsset.Object);
	}

	// Scale: 100x100 (Unreal plane is 100x100cm, so scale by 100)
	GroundMesh->SetRelativeScale3D(FVector(100.0f, 100.0f, 1.0f));
	GroundMesh->SetRelativeLocation(FVector(0.0f, 0.0f, 0.0f));

	// Static physics
	GroundMesh->SetSimulatePhysics(false);
	GroundMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	GroundMesh->SetCollisionObjectType(ECollisionChannel::ECC_WorldStatic);
	GroundMesh->BodyInstance.bLockXRotation = true;
	GroundMesh->BodyInstance.bLockYRotation = true;
	GroundMesh->BodyInstance.bLockZRotation = true;

	// Material - grass green
	UMaterialInstanceDynamic* GroundMaterial = UMaterialInstanceDynamic::Create(
		GroundMesh->GetMaterial(0), this
	);
	if (GroundMaterial)
	{
		GroundMaterial->SetVectorParameterValue(
			FName("BaseColor"),
			FLinearColor(0.4f, 0.6f, 0.4f, 1.0f)
		);
		GroundMesh->SetMaterial(0, GroundMaterial);
	}

	GroundMesh->RegisterComponent();
}

void ABasicSceneSetup::CreateGrabbableCube()
{
	// Create cube static mesh component
	CubeMesh = NewObject<UStaticMeshComponent>(this, TEXT("Cube"));
	CubeMesh->SetupAttachment(RootComponent);

	// Load cube mesh (Unreal's default cube primitive)
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeMeshAsset(
		TEXT("/Engine/BasicShapes/Cube")
	);
	if (CubeMeshAsset.Succeeded())
	{
		CubeMesh->SetStaticMesh(CubeMeshAsset.Object);
	}

	// Position: 1 meter (100cm) above ground
	CubeMesh->SetRelativeLocation(FVector(0.0f, 0.0f, 100.0f));
	CubeMesh->SetRelativeScale3D(FVector(1.0f, 1.0f, 1.0f)); // 1m cube

	// Dynamic physics
	CubeMesh->SetSimulatePhysics(true);
	CubeMesh->SetEnableGravity(true);
	CubeMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	CubeMesh->SetCollisionObjectType(ECollisionChannel::ECC_PhysicsBody);
	CubeMesh->BodyInstance.SetMassOverride(100.0f); // 1kg = 100 Unreal mass units
	CubeMesh->SetLinearDamping(0.5f);
	CubeMesh->SetAngularDamping(0.5f);

	// VR Grabbing (using Unreal's VR template approach)
	// Note: Requires UGraspingHandComponent or custom grab logic
	// Simplified here - in production, implement IVRGrabInterface
	CubeMesh->SetCollisionResponseToChannel(
		ECollisionChannel::ECC_Pawn,
		ECollisionResponse::ECR_Overlap
	);

	// Material - red with metallic/roughness
	UMaterialInstanceDynamic* CubeMaterial = UMaterialInstanceDynamic::Create(
		CubeMesh->GetMaterial(0), this
	);
	if (CubeMaterial)
	{
		CubeMaterial->SetVectorParameterValue(
			FName("BaseColor"),
			FLinearColor(0.8f, 0.2f, 0.2f, 1.0f)
		);
		CubeMaterial->SetScalarParameterValue(FName("Metallic"), 0.5f);
		CubeMaterial->SetScalarParameterValue(FName("Roughness"), 0.3f);
		CubeMesh->SetMaterial(0, CubeMaterial);
	}

	CubeMesh->RegisterComponent();
}
