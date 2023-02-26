import { getInput } from "@actions/core"
import { createClient } from "@supabase/supabase-js"
import fs, { readFileSync } from "fs"

const SB_URL = getInput("SB_URL")
const SB_ANON_KEY = getInput("SB_ANON_KEY")
const EMAIL = getInput("EMAIL")
const PASSWORD = getInput("PASSWORD")
const ONLY_MODIFIED = getInput("ONLY_MODIFIED")
const PATH = getInput("PATH")
const MODIFIED_FILES = getInput("MODIFIED_FILES").split(/ /g)
const REGEX_SCRIPT_ID =
  /{\$UNDEF SCRIPT_ID}{\$DEFINE SCRIPT_ID := '[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}'}/

const REGEX_SETTINGS =
  /.*begin\n.*Login.PlayerIndex.*:=.*((.+\n)+).*StatsPayload.SetUsername\('.*'.*((.+\n)+).*end;\n/
const SETTINGS_REPLACE =
  "begin\n  Login.PlayerIndex     := 0;\n  StatsPayload.Username := '';\nend;"

let workingDir = process.cwd() + "/"
if (PATH !== "") workingDir += PATH + "/"

console.log("PROCESS CURRENT WORKING DIRECTORY: ", process.cwd())
console.log("WORKING DIRECTORY: ", workingDir)

interface Script {
  id: string
  name: string
  path: string
  file: string
}

let scriptArray: Script[] = []

const files = fs.readdirSync(workingDir)

files.forEach((file) => {
  const CURRENT_PATH = workingDir + file
  if (fs.lstatSync(CURRENT_PATH).isDirectory()) return
  if (!file.endsWith(".simba")) return

  const NAME = file.replace(".simba", "").replace("_", " ")
  let content = readFileSync(CURRENT_PATH, "utf8")
  const MATCHES = content.match(REGEX_SCRIPT_ID)

  content = content.replace(REGEX_SETTINGS, SETTINGS_REPLACE)
  fs.writeFileSync(file, content, "utf8")

  if (MATCHES == null) return
  const ID = MATCHES[0]
    .replace("{$UNDEF SCRIPT_ID}{$DEFINE SCRIPT_ID := '", "")
    .replace("'}", "")

  let script: Script = {
    id: ID,
    name: NAME,
    path: CURRENT_PATH,
    file: file,
  }

  console.log("Found script: ", script.name)
  scriptArray.push(script)
})

if (ONLY_MODIFIED === "true") {
  console.log("ONLY_MODIFIED is on so we will filter the scripts!")
  let tmp: Script[] = []

  MODIFIED_FILES.forEach((file) => {
    if (!file.endsWith(".simba")) return

    let splittedStr = file.split("/")
    file = splittedStr[splittedStr.length - 1]

    for (let i = 0; i < scriptArray.length; i++) {
      if (scriptArray[i].file === file) {
        console.log("Modified file found: ", scriptArray[i].name)
        tmp.push(scriptArray[i])
      }
    }
  })

  scriptArray = tmp
}

const supabase = createClient(SB_URL, SB_ANON_KEY, {
  autoRefreshToken: true,
  persistSession: true,
})

let isLoggedIn: boolean = false

const pad = (n: number, size: number) => {
  let s = n + ""
  while (s.length < size) s = "0" + s
  return s
}

const loginSupabase = async () => {
  const { error } = await supabase.auth.signIn({
    email: EMAIL,
    password: PASSWORD,
  })

  if (error) return console.error(error)
  isLoggedIn = true
  console.log("LOGGED IN TO: https://waspscripts.com")
}

const getRevision = async (id: string) => {
  console.log("GETTING ", id, " REVISION")
  const { data, error } = await supabase
    .from("scripts_protected")
    .select("revision")
    .eq("id", id)

  if (error) {
    console.error(error)
    return 0
  }

  console.log("CURRENT REVISION: ", data[0])
  let revision = data[0].revision as number
  return revision + 1
}

const updateFileRevision = async (path: string, revision: number) => {
  console.log("UPDATING ", path, " REVISION TO: ", revision)
  let content = fs.readFileSync(path, "utf8")

  content = content.toString()
  let regex = /{\$UNDEF SCRIPT_REVISION}{\$DEFINE SCRIPT_REVISION := '(\d*?)'}/

  let replaceStr =
    "{$UNDEF SCRIPT_REVISION}{$DEFINE SCRIPT_REVISION := '" +
    revision.toString() +
    "'}"

  if (content.match(regex)) {
    content = content.replace(regex, replaceStr)
  } else {
    content = replaceStr.concat("\n").concat(content)
  }

  fs.writeFileSync(path, content, "utf8")
}

export const uploadFile = async (path: string, file: string) => {
  console.log("UPLOADING FILE TO: ", path)
  const { error } = await supabase.storage.from("scripts").upload(path, file)

  if (error) return console.error(error)
}

const run = async (id: string, path: string) => {
  if (!isLoggedIn) await loginSupabase()
  if (!isLoggedIn) {
    console.error("FAILED TO LOG IN.")
    return
  }

  const rev = await getRevision(id)
  await updateFileRevision(path, rev)

  const file = fs.readFileSync(path, "utf8")

  await uploadFile(id + "/" + pad(rev, 9) + "/script.simba", file)
}

for (let i = 0; i < scriptArray.length; i++) {
  run(scriptArray[i].id, workingDir + scriptArray[i].file)
}

if (isLoggedIn) supabase.auth.signOut()
