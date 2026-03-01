'use client';

import type { R3FNode } from '@holoscript/core';
import { Text, Sparkles, Environment } from '@react-three/drei';
import { MeshNode } from './MeshNode';
import { AnimatedMeshNode } from './AnimatedMeshNode';

interface R3FNodeRendererProps {
  node: R3FNode;
}

export function R3FNodeRenderer({ node }: R3FNodeRendererProps) {
  const children = node.children?.map((child: R3FNode, i: number) => (
    <R3FNodeRenderer key={child.id || `child-${i}`} node={child} />
  ));

  const { props } = node;

  switch (node.type) {
    case 'mesh': {
      // Check if this mesh has keyframe animations
      const hasKeyframes = props.keyframes && Array.isArray(props.keyframes) && props.keyframes.length > 0;
      // Non-mesh children (lights, effects) still render via R3FNodeRenderer
      const nonMeshChildren = node.children
        ?.filter((c: R3FNode) => c.type !== 'mesh')
        .map((child: R3FNode, i: number) => (
          <R3FNodeRenderer key={child.id || `non-mesh-${i}`} node={child} />
        ));
      return (
        <group>
          {hasKeyframes
            ? <AnimatedMeshNode node={node} />
            : <MeshNode node={node} />
          }
          {nonMeshChildren}
        </group>
      );
    }

    case 'group':
      return (
        <group position={props.position} rotation={props.rotation} scale={props.scale}>
          {children}
        </group>
      );

    case 'directionalLight':
      return (
        <directionalLight
          color={props.color}
          intensity={props.intensity ?? 1}
          position={props.position || [5, 10, 5]}
          castShadow={props.shadows ?? false}
        />
      );

    case 'ambientLight':
      return <ambientLight color={props.color} intensity={props.intensity ?? 0.4} />;

    case 'pointLight':
      return (
        <pointLight
          color={props.color}
          intensity={props.intensity ?? 1}
          position={props.position || [0, 5, 0]}
          distance={props.distance}
          decay={props.decay ?? 2}
        />
      );

    case 'spotLight':
      return (
        <spotLight
          color={props.color}
          intensity={props.intensity ?? 1}
          position={props.position || [0, 10, 0]}
          angle={props.angle ?? 0.3}
          penumbra={props.penumbra ?? 0.5}
          castShadow={props.shadows ?? false}
        />
      );

    case 'hemisphereLight':
      return (
        <hemisphereLight
          color={props.color || '#ffffff'}
          groundColor={props.groundColor || '#444444'}
          intensity={props.intensity ?? 0.5}
        />
      );

    case 'Text':
      return (
        <Text
          position={props.position}
          rotation={props.rotation}
          fontSize={props.fontSize ?? 0.5}
          color={props.color || '#ffffff'}
          anchorX="center"
          anchorY="middle"
        >
          {props.text || props.content || ''}
        </Text>
      );

    case 'Sparkles':
      return (
        <Sparkles
          count={props.count ?? 50}
          size={props.size ?? 2}
          scale={props.scale ?? 5}
          color={props.color}
          speed={props.speed ?? 0.5}
        />
      );

    case 'Environment':
      return (
        <Environment preset={props.envPreset || 'studio'} background={props.background ?? false} />
      );

    case 'fog':
      return null; // Fog is applied at Canvas level

    case 'EffectComposer':
      // Post-processing — skip for MVP, render children only
      return <>{children}</>;

    default:
      // Unknown type — wrap in group and render children
      return (
        <group position={props.position} rotation={props.rotation} scale={props.scale}>
          {children}
        </group>
      );
  }
}
