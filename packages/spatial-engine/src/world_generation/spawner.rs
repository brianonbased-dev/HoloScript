use crate::world_generation::solver::SolvedLayout;
use bevy::prelude::*;

#[derive(Component)]
pub struct GeneratedRoom {
    pub width: f32,
    pub length: f32,
}

pub struct RoomSpawner;

impl RoomSpawner {
    pub fn spawn_solved_room(
        commands: &mut Commands,
        meshes: &mut ResMut<Assets<Mesh>>,
        materials: &mut ResMut<Assets<StandardMaterial>>,
        solution: &SolvedLayout,
        center_x: f32,
        center_z: f32,
    ) {
        let w = solution.width as f32;
        let l = solution.length as f32;
        let h = 3.0; // Standard 3m ceiling height
        let wall_thickness = 0.2;

        let wall_material = materials.add(StandardMaterial {
            base_color: Color::rgb(0.8, 0.8, 0.8), // Placeholder for Memory-driven aesthetic
            ..default()
        });

        // Floor spawning
        let floor_material = materials.add(StandardMaterial {
            base_color: Color::rgb(0.2, 0.2, 0.2),
            ..default()
        });

        commands.spawn((
            PbrBundle {
                mesh: meshes.add(Mesh::from(shape::Plane::from_size(w.max(l)))),
                material: floor_material,
                transform: Transform::from_xyz(center_x, 0.0, center_z),
                ..default()
            },
            GeneratedRoom {
                width: w,
                length: l,
            },
        ));

        // North Wall
        commands.spawn(PbrBundle {
            mesh: meshes.add(Mesh::from(shape::Box::new(w, h, wall_thickness))),
            material: wall_material.clone(),
            transform: Transform::from_xyz(center_x, h / 2.0, center_z - l / 2.0),
            ..default()
        });

        // South Wall
        commands.spawn(PbrBundle {
            mesh: meshes.add(Mesh::from(shape::Box::new(w, h, wall_thickness))),
            material: wall_material.clone(),
            transform: Transform::from_xyz(center_x, h / 2.0, center_z + l / 2.0),
            ..default()
        });

        // East Wall
        commands.spawn(PbrBundle {
            mesh: meshes.add(Mesh::from(shape::Box::new(wall_thickness, h, l))),
            material: wall_material.clone(),
            transform: Transform::from_xyz(center_x + w / 2.0, h / 2.0, center_z),
            ..default()
        });

        // West Wall
        commands.spawn(PbrBundle {
            mesh: meshes.add(Mesh::from(shape::Box::new(wall_thickness, h, l))),
            material: wall_material,
            transform: Transform::from_xyz(center_x - w / 2.0, h / 2.0, center_z),
            ..default()
        });

        println!(
            "Z3 Generated Room Materialized: {}m x {}m at ({}, {})",
            w, l, center_x, center_z
        );
    }
}
