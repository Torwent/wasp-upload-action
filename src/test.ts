import { getInput } from "@actions/core"
import { createClient } from "@supabase/supabase-js"
import fs from "fs"

const SB_URL = "SUPABASE_URL"
const SB_ANON_KEY = "SUPABASE_ANON_KEY"
const EMAIL = "EMAIL"
const PASSWORD = "PASSWORD"
const SCRIPTS_INPUT = `SCRIPT_ID1=test1.simba,
SCRIPT_ID2=test2.simba`
const SCRIPTS = SCRIPTS_INPUT.split(",\n")

interface Script {
  id: string
  file: string
}

let scriptArray: Script[] = []
for (let i = 0; i < SCRIPTS.length; i++) {
  let splitStr = SCRIPTS[i].split("=")
  let script: Script = {
    id: splitStr[0],
    file: splitStr[1],
  }
  scriptArray.push(script)
}

const supabase = createClient(SB_URL, SB_ANON_KEY)
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
  console.log("Logged in to waspscripts.com as: ", getInput("EMAIL"))
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
  const { error } = await supabase.storage.from("scripts").upload(path, file)

  if (error) return console.error(error)
}

const run = async (id: string, path: string) => {
  if (!isLoggedIn) await loginSupabase()

  const rev = await getRevision(id)

  await updateFileRevision(path, rev)

  const file = fs.readFileSync(path, "utf8")

  console.log("Uploading id: ", id, ", revision: ", rev, " file: ", path)

  await uploadFile(id + "/" + pad(rev, 9) + "/script.simba", file)

  const { error } = await supabase
    .from("scripts")
    .update({ revision: rev })
    .match({ id: id })
  if (error) console.error(error)
}

for (let i = 0; i < scriptArray.length; i++) {
  run(scriptArray[i].id, process.cwd() + "/test_files/" + scriptArray[i].file)
}