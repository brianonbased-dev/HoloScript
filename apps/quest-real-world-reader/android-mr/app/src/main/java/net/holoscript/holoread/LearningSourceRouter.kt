// @generated from reader.holo trusted source templates. DO NOT EDIT.
package net.holoscript.holoread

import android.net.Uri

data class LearningSource(val kind: String, val label: String, val uri: Uri)

private data class SourceTemplate(
    val kind: String,
    val label: String,
    val host: String,
    val path: String,
    val query: List<Pair<String, String>>,
)

object LearningSourceRouter {
  private val ALLOWED_HOSTS = setOf("en.wikipedia.org", "commons.wikimedia.org", "www.youtube.com")
  private val templates =
      listOf(
    SourceTemplate(
        kind = "article",
        label = "Wikipedia article",
        host = "en.wikipedia.org",
        path = "/wiki/Special:Search",
        query = listOf("search" to "{term}"),
    ),
    SourceTemplate(
        kind = "image",
        label = "Wikimedia Commons images",
        host = "commons.wikimedia.org",
        path = "/wiki/Special:MediaSearch",
        query = listOf("type" to "image", "search" to "{term}"),
    ),
    SourceTemplate(
        kind = "video",
        label = "YouTube explainers",
        host = "www.youtube.com",
        path = "/results",
        query = listOf("search_query" to "{term} explained"),
    )
      )

  fun sourcesFor(term: String): List<LearningSource> {
    require(term.isNotBlank()) { "A selected term is required" }
    return templates.map { template ->
      LearningSource(template.kind, template.label, buildUri(template, term))
    }
  }

  fun uriFor(kind: String, term: String): Uri =
      sourcesFor(term).firstOrNull { it.kind == kind }?.uri
          ?: error("Unknown learning source kind")

  private fun buildUri(template: SourceTemplate, term: String): Uri {
    val host = template.host.lowercase()
    require(host in ALLOWED_HOSTS) { "Learning source host is not allowed" }
    val builder = Uri.Builder().scheme("https").authority(host).path(template.path)
    template.query.forEach { (key, value) ->
      builder.appendQueryParameter(key, value.replace("{term}", term))
    }
    return builder.build()
  }
}
