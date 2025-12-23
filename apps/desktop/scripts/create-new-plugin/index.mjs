#!/usr/bin/env node
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function crateNameFromId(id) {
  // Only append -plugin if not already present
  return id.endsWith('-plugin') ? id : `${id}-plugin`
}

function libBaseFromCrate(crate) {
  return crate.replace(/-/g, '_')
}

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=')
      if (typeof v === 'undefined') {
        args[k] = true
      } else {
        args[k] = v
      }
    } else if (a.startsWith('-')) {
      const k = a.slice(1)
      const v = argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : true
      args[k] = v
    }
  }
  return args
}

async function prompt(question, def = '') {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const q = def ? `${question} [${def}]: ` : `${question}: `
  const answer = await new Promise((resolve) => rl.question(q, resolve))
  rl.close()
  return answer || def
}

async function pathExists(p) {
  try { await fs.access(p); return true } catch { return false }
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true })
}

async function writeFile(p, content, mode) {
  await ensureDir(path.dirname(p))
  await fs.writeFile(p, content, { encoding: 'utf8' })
  if (mode) {
    try { await fs.chmod(p, mode) } catch {}
  }
}

function detectOS() {
  const p = process.platform
  if (p === 'darwin') return { prefix: 'lib', ext: 'dylib' }
  if (p === 'win32') return { prefix: '', ext: 'dll' }
  return { prefix: 'lib', ext: 'so' }
}

async function main() {
  const args = parseArgs(process.argv)

  // Roots
  const desktopDir = path.resolve(__dirname, '../../') // apps/desktop
  const pluginsRoot = path.resolve(desktopDir, 'src-tauri/plugins')

  // Gather inputs
  const name = args.name || args.n || await prompt('Plugin display name', 'My Plugin')
  const id = args.id || args.i || await prompt('Plugin id (slug)', slugify(name))
  const crate = args.crate || args.c || await prompt('Crate name', crateNameFromId(id))
  const author = args.author || args.a || await prompt('Author', 'Your Name')
  const version = args.version || args.v || await prompt('Version', '0.1.0')
  const desc = args.desc || args.d || await prompt('Description', 'A TableFri plugin')
  const independent = Boolean(args['independent'] || args.I)

  const libBase = libBaseFromCrate(crate)
  const os = detectOS()

  const pluginDir = path.resolve(pluginsRoot, id)
  if (await pathExists(pluginDir)) {
    if (!(args.force || args.f)) {
      console.error(`Target exists: ${pluginDir}. Use --force to overwrite.`)
      process.exit(2)
    }
    await fs.rm(pluginDir, { recursive: true, force: true })
  }

  // Files content
  // PascalCase type name derived from id; strip trailing -plugin to avoid PluginPlugin
  let pascal = String(id).replace(/-plugin$/, '')
    .split(/[^A-Za-z0-9]+/).filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join('')
  if (/^[0-9]/.test(pascal)) pascal = 'Plugin' + pascal
  const typeName = `${pascal}Plugin`

  const cargoToml = `
[package]
name = "${crate}"
version = "${version}"
edition = "2021"
description = "${desc}"
authors = ["${author}"]
license = "MIT"

[lib]
crate-type = ["cdylib"]

[dependencies]
tablefri-plugin-api = { path = "../tablefri-plugin-api" }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
`.trimStart()

  const libRs = `
//! ${name}
use serde_json::Value;
use tablefri_plugin_api::*;

pub struct ${typeName} { ctx: Option<PluginContext> }

impl Default for ${typeName} {
    fn default() -> Self { Self { ctx: None } }
}

impl Plugin for ${typeName} {
    fn initialize(&mut self, ctx: &PluginContext) -> Result<(), String> {
        self.ctx = Some(ctx.clone());
        println!("[${typeName}] initialized: {}", ctx.plugin_id);
        Ok(())
    }
    fn shutdown(&mut self) -> Result<(), String> { println!("[${typeName}] shutdown"); Ok(()) }
    fn get_tools(&self) -> Vec<ToolDefinition> {
        let plugin_id = self.ctx.as_ref().map(|c| c.plugin_id.clone()).unwrap_or_else(|| "${id}".into());
        vec![ToolDefinition::no_params(&plugin_id, "hello", "Say hello from ${id}")]
    }
    fn execute_tool(&self, call: &ToolCall) -> ToolResult {
        match call.name.as_str() {
            "hello" => ToolResult::success(json!({ "message": "Hello from ${id}" })),
            _ => ToolResult::error("Unknown tool"),
        }
    }
    fn on_hook(&mut self, _hook: &str, _data: &Value) -> Option<Value> { None }
}

export_plugin!(${typeName}, ${typeName}::default);
`.trimStart()

  const manifest = {
    id,
    name,
    version,
    author,
    description: desc,
    main: `${os.prefix}${libBase}.${os.ext}`,
    ui: { panel: 'ui/Panel.vue', position: 'sidebar' },
    permissions: [],
    tools: [ { name: 'hello', description: `Say hello from ${id}` } ],
    hooks: []
  }

  const panelVue = `
<script setup lang=\"ts\">
import { ref } from 'vue'
const msg = ref('Hello from ${name}!')
</script>
<template>
  <div style=\"padding: 12px; color: #fff;\">
    <h3 style=\"margin: 0 0 8px;\">${name}</h3>
    <p>{{ msg }}</p>
  </div>
</template>
`.trimStart()

  const readme = `# ${name}\n\nA plugin for TableFri.\n\n## Build & Package\n\n- Run: ./build.sh\n- Output: dist/${id}.zip\n`

  const buildSh = `#!/usr/bin/env bash\nset -euo pipefail\n\nSCRIPT_DIR=\"\$(cd \"\$(dirname \"$0\")\" && pwd)\"\nPLUGIN_ID=\"${id}\"\nCRATE_NAME=\"${crate}\"\nLIB_BASE=\"${libBase}\"\n\ncase \"\$(uname -s)\" in\n  Darwin*) LIB_PREFIX=\"lib\"; LIB_EXT=\"dylib\" ;;\n  Linux*)  LIB_PREFIX=\"lib\"; LIB_EXT=\"so\" ;;\n  MINGW*|MSYS*|CYGWIN*) LIB_PREFIX=\"\"; LIB_EXT=\"dll\" ;;\n  *) echo \"Unsupported OS\"; exit 1 ;;\nesac\nLIB_NAME=\"\${LIB_PREFIX}\${LIB_BASE}.\${LIB_EXT}\"\n\nWORKSPACE_DIR=\"$SCRIPT_DIR/../../\"\nWORKSPACE_TOML=\"$WORKSPACE_DIR/Cargo.toml\"\nIS_MEMBER=0\nif [ -f \"$WORKSPACE_TOML\" ] && grep -q '^\\[workspace\\]' \"$WORKSPACE_TOML\" 2>/dev/null; then\n  if grep -q \"plugins/$PLUGIN_ID\" \"$WORKSPACE_TOML\" 2>/dev/null; then IS_MEMBER=1; fi\nfi\n\nif [ $IS_MEMBER -eq 1 ]; then\n  echo \"Building via workspace: $CRATE_NAME\"\n  (cd \"$WORKSPACE_DIR\" && cargo build --release -p \"$CRATE_NAME\")\n  BUILT_LIB=\"$WORKSPACE_DIR/target/release/$LIB_NAME\"\nelse\n  echo \"Building locally: $CRATE_NAME\"\n  (cd \"$SCRIPT_DIR\" && cargo build --release)\n  BUILT_LIB=\"$SCRIPT_DIR/target/release/$LIB_NAME\"\nfi\n\n[ -f \"$BUILT_LIB\" ] || { echo \"Build artifact not found: $BUILT_LIB\" >&2; exit 2; }\n\nSTAGE_DIR=\"$SCRIPT_DIR/dist/pkg\"\nOUT_ZIP=\"$SCRIPT_DIR/dist/$PLUGIN_ID.zip\"\nrm -rf \"$STAGE_DIR\" \"$OUT_ZIP\"\nmkdir -p \"$STAGE_DIR/ui\"\n\ncp \"$BUILT_LIB\" \"$STAGE_DIR/\"\ncp \"$SCRIPT_DIR/manifest.json\" \"$STAGE_DIR/\"\n[ -f \"$SCRIPT_DIR/README.md\" ] && cp \"$SCRIPT_DIR/README.md\" \"$STAGE_DIR/\" || true\nif [ -d \"$SCRIPT_DIR/ui\" ] && [ \"\$(ls -A \"$SCRIPT_DIR/ui\" 2>/dev/null)\" ]; then\n  cp -R \"$SCRIPT_DIR/ui/\"* \"$STAGE_DIR/ui/\"\nfi\n\n(cd \"$STAGE_DIR\" && zip -r \"$OUT_ZIP\" . >/dev/null)\n\necho \"Plugin package: $OUT_ZIP\"\n`

  // Write files
  await ensureDir(pluginDir)
  await writeFile(path.join(pluginDir, 'Cargo.toml'), cargoToml)
  await ensureDir(path.join(pluginDir, 'src'))
  await writeFile(path.join(pluginDir, 'src', 'lib.rs'), libRs)
  await writeFile(path.join(pluginDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  await ensureDir(path.join(pluginDir, 'ui'))
  await writeFile(path.join(pluginDir, 'ui', 'Panel.vue'), panelVue)
  await writeFile(path.join(pluginDir, 'README.md'), readme)
  await writeFile(path.join(pluginDir, 'build.sh'), buildSh, 0o755)

  // Workspace integration: add current plugin (unless --independent), and prune missing plugins/* entries to avoid cargo errors.
  let addedToWorkspace = false
  const cargoPath = path.resolve(desktopDir, 'src-tauri/Cargo.toml')
  if (await pathExists(cargoPath)) {
    try {
      let cargo = await fs.readFile(cargoPath, 'utf8')
      const wsIdx = cargo.indexOf('[workspace]')
      const memIdx = cargo.indexOf('members', wsIdx)
      const openIdx = cargo.indexOf('[', memIdx)
      const closeIdx = cargo.indexOf(']', openIdx)
      if (wsIdx >= 0 && memIdx >= 0 && openIdx >= 0 && closeIdx > openIdx) {
        const arrayBody = cargo.slice(openIdx + 1, closeIdx)
        const entries = Array.from(arrayBody.matchAll(/"([^"]+)"/g)).map(m => m[1])
        const keep = []
        const seen = new Set()
        for (const e of entries) {
          if (seen.has(e)) continue
          if (e.startsWith('plugins/')) {
            const p = path.resolve(desktopDir, 'src-tauri', e)
            if (!(await pathExists(p))) continue // prune missing plugin path
          }
          keep.push(e)
          seen.add(e)
        }
        if (!independent) {
          const pluginEntry = `plugins/${id}`
          if (!seen.has(pluginEntry)) {
            keep.push(pluginEntry)
            addedToWorkspace = true
          } else {
            addedToWorkspace = true
          }
        }
        // Reconstruct the members array neatly
        const newArray = '\n' + keep.map(e => `    "${e}",`).join('\n') + '\n]'
        const before = cargo.slice(0, openIdx)
        const after = cargo.slice(closeIdx + 1)
        cargo = before + '[' + newArray + after
        await fs.writeFile(cargoPath, cargo, 'utf8')
        if (addedToWorkspace && !independent) console.log(`Workspace updated: added plugins/${id}`)
        // Warn if pruning occurred
        const pruned = entries.filter(e => e.startsWith('plugins/')).filter(e => !keep.includes(e))
        if (pruned.length) console.log('Workspace pruned missing plugin entries:', pruned.join(', '))
      }
    } catch (e) {
      console.warn('Failed to update workspace Cargo.toml:', e.message)
    }
  }

  // If not added to workspace, prepend empty [workspace] to keep independent build working under parent workspace
  if (!addedToWorkspace) {
    const pluginCargo = path.join(pluginDir, 'Cargo.toml')
    try {
      const orig = await fs.readFile(pluginCargo, 'utf8')
      if (!/^\[workspace\]/m.test(orig)) {
        await fs.writeFile(pluginCargo, `[workspace]\n\n` + orig, 'utf8')
      }
      console.log('Initialized as independent plugin (local [workspace])')
    } catch {}
  }

  console.log('\nCreated plugin at:', pluginDir)
  console.log('- Build: ./build.sh')
  console.log('- Package output: dist/' + id + '.zip')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
