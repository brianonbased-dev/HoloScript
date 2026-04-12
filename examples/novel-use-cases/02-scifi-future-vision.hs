/**
 * Optimistic Sci-Fi Future Vision Builder — .hs Process
 *
 * Sequential pipeline: submit lore → vote → tally → branch → export.
 *
 * @version 5.0.0
 * @format .hs (process)
 */
environment { skybox: { type: "gradient", top: "#020010", bottom: "#0a0a30" }; ambient_light: 0.3; shadows: true; fog: { color: "#1a1a3e", density: 0.003 } }

light "OrbitalSun" {
  type: "directional"
  color: "#ffeedd"
  intensity: 0.8
  position: { x: 5, y: 12, z: 5 }
  cast_shadows: true
}

post_processing {
  bloom: { enabled: true, intensity: 0.5, threshold: 0.5 }
  tone_mapping: { type: "aces", exposure: 0.9 }
}

object "lore_intake" {
  geometry: "cube"; color: "#ffd700"; position: { x: -6, y: 2, z: 0 }; scale: { x: 0.5, y: 0.5, z: 0.5 }
  state { queue: []; total_submits: 0 }
  function submit(text, faction, author_id) {
    const entry = { id: generate_uuid(), text: text, faction: faction, author: author_id, at: current_time() }
    state.queue.push(entry); state.total_submits += 1
    emit("lore_submitted", entry)
  }
  on_error(err) { emit("intake_error", { error: err.message }) }
}

object "vote_box" {
  geometry: "octahedron"; color: "#0088ff"; position: { x: -2, y: 2, z: 0 }; scale: { x: 0.5, y: 0.5, z: 0.5 }
  state { proposals: {}; quorum: 3; total_votes: 0 }
  function open_vote(lore_entry) {
    state.proposals[lore_entry.id] = { lore: lore_entry, votes_for: 0, votes_against: 0, voters: [], status: "open" }
    emit("vote_opened", { lore_id: lore_entry.id, faction: lore_entry.faction })
  }
  function cast(lore_id, voter_id, approve) {
    const p = state.proposals[lore_id]
    if (!p || p.status != "open" || p.voters.includes(voter_id)) return
    p.voters.push(voter_id)
    if (approve) p.votes_for += 1
    else p.votes_against += 1
    state.total_votes += 1
    if (p.voters.length >= state.quorum) {
      emit("quorum_reached", { lore_id: lore_id, votes_for: p.votes_for, votes_against: p.votes_against })
    }
  }
}

object "tally_engine" {
  geometry: "sphere"; color: "#00cc66"; position: { x: 2, y: 2, z: 0 }; scale: { x: 0.5, y: 0.5, z: 0.5 }
  state { tallied: 0 }
  function tally(quorum_data) {
    const approved = quorum_data.votes_for > quorum_data.votes_against
    state.tallied += 1
    emit("tally_result", { lore_id: quorum_data.lore_id, approved: approved, votes_for: quorum_data.votes_for, votes_against: quorum_data.votes_against })
  }
}

object "branch_manager" {
  geometry: "torus"; color: "#cc00ff"; position: { x: 6, y: 2, z: 0 }; scale: { x: 0.5, y: 0.3, z: 0.5 }
  state { branches: []; active_branch: "main_timeline" }
  function process_tally(result) {
    if (result.approved) {
      state.branches.push({ lore_id: result.lore_id, branch: state.active_branch, at: current_time() })
      emit("lore_canonized", { lore_id: result.lore_id, branch: state.active_branch })
    } else {
      emit("lore_rejected", { lore_id: result.lore_id })
    }
  }
}

object "pipeline_status" {
  geometry: "cube"; color: "#37474f"; position: { x: 0, y: 5, z: -3 }; scale: { x: 8, y: 0.8, z: 0.1 }
  state { stage: "idle"; stories_approved: 0 }
  function update(name) {
    state.stage = name
    if (name == "submitted") color = "#ffd700"
    if (name == "voting") color = "#0088ff"
    if (name == "tallying") color = "#00cc66"
    if (name == "branching") color = "#cc00ff"
    if (name == "approved") { color = "#00e676"; state.stories_approved += 1 }
  }
}

// Pipeline wiring
connect lore_intake.lore_submitted -> vote_box.open_vote
connect vote_box.quorum_reached -> tally_engine.tally
connect tally_engine.tally_result -> branch_manager.process_tally

connect lore_intake.lore_submitted -> pipeline_status.update("submitted")
connect vote_box.vote_opened -> pipeline_status.update("voting")
connect vote_box.quorum_reached -> pipeline_status.update("tallying")
connect tally_engine.tally_result -> pipeline_status.update("branching")
connect branch_manager.lore_canonized -> pipeline_status.update("approved")
