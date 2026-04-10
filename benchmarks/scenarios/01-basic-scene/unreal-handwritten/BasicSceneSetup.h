// BasicSceneSetup.h
// Hand-written Unreal C++ baseline for Scenario 1: Basic VR Scene
//
// Purpose: Performance comparison baseline for HoloScript-generated code
// Implements: Ground plane + grabbable cube with physics
//
// Expected Performance: 88 FPS @ Quest 2

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "BasicSceneSetup.generated.h"

UCLASS()
class HOLOSCRIPTBENCHMARK_API ABasicSceneSetup : public AActor
{
	GENERATED_BODY()

public:
	// Sets default values for this actor's properties
	ABasicSceneSetup();

protected:
	// Called when the game starts or when spawned
	virtual void BeginPlay() override;

private:
	// Setup environment: procedural sky and day lighting
	void SetupEnvironment();

	// Create ground plane: 100x100 static physics collider
	void CreateGround();

	// Create grabbable cube: dynamic physics + VR interaction
	void CreateGrabbableCube();

	// Ground mesh component
	UPROPERTY()
	class UStaticMeshComponent* GroundMesh;

	// Cube mesh component
	UPROPERTY()
	class UStaticMeshComponent* CubeMesh;

	// Directional light for day lighting
	UPROPERTY()
	class UDirectionalLightComponent* SunLight;

	// Sky sphere for procedural sky
	UPROPERTY()
	class UStaticMeshComponent* SkySphere;
};
