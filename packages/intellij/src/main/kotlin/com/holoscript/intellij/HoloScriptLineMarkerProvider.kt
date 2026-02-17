package com.holoscript.intellij

import com.holoscript.intellij.parser.HoloScriptElementTypes
import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProvider
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.psi.PsiElement
import com.intellij.psi.util.elementType

/**
 * Line marker provider for HoloScript.
 *
 * Adds gutter icons next to:
 * - Compositions (entry-point indicator)
 * - Networked objects (network sync indicator)
 * - Orbs with physics traits (physics indicator)
 */
class HoloScriptLineMarkerProvider : LineMarkerProvider {

    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? {
        if (element.elementType != HoloScriptElementTypes.DECLARATION) return null

        val text = element.text
        return when {
            text.trimStart().startsWith("composition") -> {
                LineMarkerInfo(
                    element,
                    element.textRange,
                    HoloScriptIcons.OBJECT,
                    { "HoloScript composition (entry point)" },
                    null,
                    GutterIconRenderer.Alignment.LEFT,
                    { "HoloScript composition" }
                )
            }
            text.contains("@networked") || text.contains("@synced") -> {
                LineMarkerInfo(
                    element,
                    element.textRange,
                    HoloScriptIcons.TRAIT,
                    { "Networked — synced across clients" },
                    null,
                    GutterIconRenderer.Alignment.LEFT,
                    { "Networked object" }
                )
            }
            else -> null
        }
    }
}
