# Create Your First Scene

Let's create a simple interactive VR scene in just a few lines!

## Step 1: Create a File

Create a new file called `hello.holo` in your project.

## Step 2: Add This Code

```holo
composition "My First VR World" {
  environment {
    skybox: "sunset"
    ambient_light: 0.4
  }

  object "FloatingOrb" {
    @grabbable
    @glowing

    position: [0, 1.5, -2]
    color: "#00ffff"

    on_grab: {
      this.glow_intensity = 2.0
    }
  }
}
```

---

📹 _Video Tutorial: [Coming Soon - Your First HoloScript Scene]_

## What This Does

- Creates a scene with a sunset skybox
- Places a glowing composition that can be grabbed in VR
- The composition glows brighter when grabbed

Click **Next** to learn about VR traits!
