package com.holoscript.intellij

import com.intellij.codeInsight.template.TemplateActionContext
import com.intellij.codeInsight.template.TemplateContextType

/**
 * Template context for HoloScript live templates.
 */
class HoloScriptTemplateContext : TemplateContextType("HoloScript") {
    override fun isInContext(context: TemplateActionContext): Boolean {
        val file = context.file
        return file.name.endsWith(".holo") || file.name.endsWith(".hsplus")
    }
}
