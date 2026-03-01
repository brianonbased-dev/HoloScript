package com.holoscript.intellij

import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

/**
 * Icons for HoloScript plugin.
 */
object HoloScriptIcons {
    @JvmField
    val FILE: Icon = IconLoader.getIcon("/icons/holoscript.svg", HoloScriptIcons::class.java)

    @JvmField
    val TRAIT: Icon = IconLoader.getIcon("/icons/trait.svg", HoloScriptIcons::class.java)

    @JvmField
    val OBJECT: Icon = IconLoader.getIcon("/icons/object.svg", HoloScriptIcons::class.java)

    @JvmField
    val COMPOSITION: Icon = IconLoader.getIcon("/icons/composition.svg", HoloScriptIcons::class.java)
}
