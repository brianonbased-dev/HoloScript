import type { SceneTemplate } from '../scene/sceneTemplates';

export const template: SceneTemplate = {
  id: 'wizard-room-acoustics',
  name: 'Room Acoustics Twin',
  description:
    'HoloAcoustics verifiable room-acoustics twin — reverberation (RT60), speech intelligibility (STI), and background noise, each certified against ANSI/ASA S12.60 and IEC 60268-16 with a tamper-evident receipt',
  thumbnail: '🔊',
  tags: [
    'architecture',
    'acoustics',
    'reverberation',
    'speech-intelligibility',
    'digital-twin',
    'verifiable',
  ],
  category: 'architecture',
  code: `composition "Room Acoustics Twin" {
  environment {
    skybox: "day"
    ambient_light: 0.8
    shadows: true
  }

  object "CarpetFloor" {
    @static
    geometry: "box"
    position: [0, -0.05, 0]
    scale: [9, 0.1, 7]
    color: "#7a5a3a"
    label: "Carpet floor (absorption 0.40)"
  }

  object "AcousticCeiling" {
    @static
    geometry: "box"
    position: [0, 3, 0]
    scale: [9, 0.1, 7]
    color: "#e8e8e0"
    label: "Acoustic ceiling tile (absorption 0.70)"
  }

  object "WallPanels" {
    @static
    geometry: "box"
    position: [0, 1.5, -3.5]
    scale: [9, 3, 0.1]
    color: "#8a9a8a"
    label: "Treated wall panels (absorption 0.30)"
  }

  object "TeacherSource" {
    @glowing
    geometry: "sphere"
    position: [-3, 1.5, 0]
    scale: [0.3, 0.3, 0.3]
    color: "#ffcc44"
    label: "Teacher (sound source)"
  }

  object "StudentReceiver" {
    @static
    geometry: "sphere"
    position: [3, 1.2, 0]
    scale: [0.25, 0.25, 0.25]
    color: "#44aaff"
    label: "Student (receiver)"
  }

  object "AcousticsDashboard" {
    @billboard
    geometry: "plane"
    position: [0, 4.2, -3]
    scale: [5.5, 1.8, 0.01]
    color: "#0a1414"
    label: "HoloAcoustics receipt — RT60 0.24 s PASS (<=0.6 ANSI) | STI 0.83 Good | Noise 33 dBA PASS"
  }
}`,
};

export default template;
