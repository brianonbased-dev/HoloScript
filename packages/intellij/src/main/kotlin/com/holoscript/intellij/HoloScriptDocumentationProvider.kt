package com.holoscript.intellij

import com.intellij.lang.documentation.DocumentationProvider
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiManager

/**
 * Documentation provider for HoloScript.
 *
 * Shows formatted HTML documentation on Ctrl+Q (Quick Documentation)
 * and on hover in the editor. Provides trait descriptions, keyword
 * documentation, and composition hints.
 */
class HoloScriptDocumentationProvider : DocumentationProvider {

    override fun generateDoc(element: PsiElement?, originalElement: PsiElement?): String? {
        val text = element?.text?.trim() ?: return null
        return buildDoc(text)
    }

    override fun getQuickNavigateInfo(element: PsiElement?, originalElement: PsiElement?): String? {
        val text = element?.text?.trim() ?: return null
        return QUICK_DOCS[text] ?: TRAIT_DOCS[text.trimStart('@')]
    }

    private fun buildDoc(text: String): String? {
        // Keyword docs
        KEYWORD_DOCS[text]?.let { return formatDoc(text, it) }

        // Trait docs (strip leading @)
        val traitName = text.trimStart('@')
        TRAIT_DOCS[traitName]?.let { return formatDoc("@$traitName", it) }

        return null
    }

    private fun formatDoc(name: String, description: String): String =
        """
        <html><body>
        <b>$name</b><br/>
        <p>$description</p>
        </body></html>
        """.trimIndent()

    companion object {
        private val KEYWORD_DOCS = mapOf(
            "orb" to "Declares an interactive 3D object in the scene. Orbs can have traits, properties, and event logic.",
            "world" to "Declares a world/scene — the root container for all objects.",
            "composition" to "Declares a reusable composition that can be instantiated multiple times.",
            "template" to "Declares a reusable template. Use 'using' to apply it to other objects.",
            "object" to "Declares a basic object without VR interaction by default.",
            "environment" to "Configures environment settings such as lighting, sky, and post-processing.",
            "import" to "Imports a module or trait definition from another file.",
            "export" to "Exports a symbol so it can be used in other files.",
            "using" to "Applies a template to the current object, inheriting its properties.",
            "logic" to "Defines the behaviour/logic block for the enclosing object.",
            "state" to "Declares reactive state variables for the enclosing object.",
            "animation" to "Defines animations for the enclosing object.",
            "physics" to "Configures physics settings for the enclosing object."
        )

        private val TRAIT_DOCS = mapOf(
            "grabbable" to "Allows the object to be grabbed and moved in VR. Works with hand controllers and ray-cast.",
            "throwable" to "Extends @grabbable — the object can be released with velocity and fly through the scene.",
            "holdable" to "The object can be held (attached to a hand) without physics release.",
            "clickable" to "The object responds to pointer click events in both VR and desktop modes.",
            "hoverable" to "The object fires hover enter/exit events when a pointer passes over it.",
            "collidable" to "Enables physics collision detection. Required for physics interactions.",
            "physics" to "Adds full rigid-body physics simulation to the object.",
            "networked" to "The object's state is automatically synchronised across all connected clients.",
            "synced" to "Alias for @networked. Prefer @networked for clarity.",
            "persistent" to "The object's state is saved across sessions.",
            "glowing" to "The object emits a configurable glow/bloom effect.",
            "animated" to "Enables animation playback on the object.",
            "spatial_audio" to "Attaches 3D spatial audio to the object, falling off with distance.",
            "anchor" to "Creates a spatial anchor that persists across sessions in AR/MR environments.",
            "grabbable_networked" to "Combined @grabbable + @networked — ideal for shared physics objects."
        )

        private val QUICK_DOCS = mapOf(
            "composition" to "entry-point composition",
            "orb" to "interactive 3D object",
            "template" to "reusable template",
            "world" to "scene root"
        )
    }
}
