package com.holoscript.intellij.actions

import com.intellij.ide.actions.CreateFileFromTemplateAction
import com.intellij.ide.actions.CreateFileFromTemplateDialog
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiDirectory
import com.holoscript.intellij.HoloScriptIcons

/**
 * Action to create a new HoloScript file.
 */
class NewHoloScriptFileAction : CreateFileFromTemplateAction(
    "HoloScript File",
    "Create a new HoloScript file",
    HoloScriptIcons.FILE
) {
    override fun buildDialog(
        project: Project,
        directory: PsiDirectory,
        builder: CreateFileFromTemplateDialog.Builder
    ) {
        builder
            .setTitle("New HoloScript File")
            .addKind("Empty scene", HoloScriptIcons.FILE, "HoloScript Scene")
            .addKind("Composition", HoloScriptIcons.COMPOSITION, "HoloScript Composition")
            .addKind("Template", HoloScriptIcons.OBJECT, "HoloScript Template")
    }

    override fun getActionName(
        directory: PsiDirectory?,
        newName: String?,
        templateName: String?
    ): String = "Create HoloScript File: $newName"
}
