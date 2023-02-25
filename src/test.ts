import { createClient } from "@supabase/supabase-js"
import fs, { readFileSync } from "fs"

const SB_URL = "SB_URL"
const SB_ANON_KEY = "SB_ANON_KEY"
const EMAIL = "EMAIL"
const PASSWORD = "PASSWORD"
let ONLY_MODIFIED = "true"
let PATH = "test_files"
const MODIFIED_FILES = `test_files/test1.simba`.split(/ /g)

const REGEX_SCRIPT_ID =
  /{\$UNDEF SCRIPT_ID}{\$DEFINE SCRIPT_ID := '[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}'}/

let workingDir = process.cwd() + "/"
if (PATH !== "") workingDir += PATH + "/"

interface Script {
  id: string
  name: string
  path: string
  file: string
}

let scriptArray: Script[] = []
const files = fs.readdirSync(workingDir)

files.forEach((file) => {
  let name = file.replace(".simba", "").replace("_", " ")
  let content = readFileSync(workingDir + file, "utf8")
  let matches = content.match(REGEX_SCRIPT_ID)

  if (matches == null) return
  let id = matches[0]
    .replace("{$UNDEF SCRIPT_ID}{$DEFINE SCRIPT_ID := '", "")
    .replace("}", "")

  let script: Script = {
    id: id,
    name: name,
    path: workingDir + file,
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
  console.log("Logged in to waspscripts.com as: ", EMAIL)
}

const getRevision = async (id: string) => {
  const { data, error } = await supabase
    .from("scripts")
    .select("revision")
    .eq("id", id)

  if (error) {
    console.error(error)
    return 0
  }
  return (data[0].revision as unknown as number) + 1
}

const updateFileRevision = async (path: string, revision: number) => {
  const contents = fs.readFileSync(path, "utf8")

  let fileString = contents.toString()
  let regex = /{\$UNDEF SCRIPT_REVISION}{\$DEFINE SCRIPT_REVISION := '(\d*?)'}/

  let replaceStr =
    "{$UNDEF SCRIPT_REVISION}{$DEFINE SCRIPT_REVISION := '" +
    revision.toString() +
    "'}"

  if (fileString.match(regex)) {
    fileString = fileString.replace(regex, replaceStr)
  } else {
    fileString = replaceStr.concat("\n").concat(fileString)
  }

  fs.writeFileSync(path, fileString, "utf8")
}

export const uploadFile = async (path: string, file: string) => {
  const { error } = await supabase.storage
    .from("scripts-test")
    .upload(path, file)

  if (error) return console.error(error)
}

const run = async (id: string, path: string) => {
  if (!isLoggedIn) await loginSupabase()

  const rev = await getRevision(id)
  console.log("Uploading id: ", id, ", revision: ", rev, " file: ", path)
  await updateFileRevision(path, rev)

  const file = fs.readFileSync(path, "utf8")

  await uploadFile(id + "/" + pad(rev, 9) + "/script.simba", file)

  const { error } = await supabase
    .from("scripts")
    .update({ revision: rev })
    .match({ id: id })
  if (error) console.error(error)
}

for (let i = 0; i < scriptArray.length; i++) {
  run(scriptArray[i].id, workingDir + scriptArray[i].file)
}

if (isLoggedIn) supabase.auth.signOut()
