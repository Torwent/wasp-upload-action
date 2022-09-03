"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFile = void 0;
const tslib_1 = require("tslib");
const core_1 = require("@actions/core");
const supabase_js_1 = require("@supabase/supabase-js");
const fs_1 = tslib_1.__importDefault(require("fs"));
const SB_URL = (0, core_1.getInput)("SUPABASE_URL");
const SB_ANON_KEY = (0, core_1.getInput)("SUPABASE_ANON_KEY");
const EMAIL = (0, core_1.getInput)("EMAIL");
const PASSWORD = (0, core_1.getInput)("PASSWORD");
const PATH = (0, core_1.getInput)("PATH");
const SCRIPTS = (0, core_1.getInput)("SCRIPTS").split(",\n");
const dirPath = (process.cwd() + "/" + PATH + "/").replaceAll("//", "/");
let scriptArray = [];
for (let i = 0; i < SCRIPTS.length; i++) {
    let splitStr = SCRIPTS[i].split("=");
    let script = {
        id: splitStr[1],
        file: splitStr[0],
    };
    scriptArray.push(script);
}
const supabase = (0, supabase_js_1.createClient)(SB_URL, SB_ANON_KEY);
let isLoggedIn = false;
const pad = (n, size) => {
    let s = n + "";
    while (s.length < size)
        s = "0" + s;
    return s;
};
const loginSupabase = async () => {
    const { error } = await supabase.auth.signIn({
        email: EMAIL,
        password: PASSWORD,
    });
    if (error)
        return console.error(error);
    isLoggedIn = true;
    console.log("Logged in to waspscripts.com as: ", EMAIL);
};
const getRevision = async (id) => {
    const { data, error } = await supabase
        .from("scripts")
        .select("revision")
        .eq("id", id);
    if (error) {
        console.error(error);
        return 0;
    }
    return data[0].revision + 1;
};
const updateFileRevision = async (path, revision) => {
    const contents = fs_1.default.readFileSync(path, "utf8");
    let fileString = contents.toString();
    let regex = /{\$UNDEF SCRIPT_REVISION}{\$DEFINE SCRIPT_REVISION := '(\d*?)'}/;
    let replaceStr = "{$UNDEF SCRIPT_REVISION}{$DEFINE SCRIPT_REVISION := '" +
        revision.toString() +
        "'}";
    if (fileString.match(regex)) {
        fileString = fileString.replace(regex, replaceStr);
    }
    else {
        fileString = replaceStr.concat("\n").concat(fileString);
    }
    fs_1.default.writeFileSync(path, fileString, "utf8");
};
const uploadFile = async (path, file) => {
    const { error } = await supabase.storage.from("scripts").upload(path, file);
    if (error)
        return console.error(error);
};
exports.uploadFile = uploadFile;
const run = async (id, path) => {
    if (!isLoggedIn)
        await loginSupabase();
    const rev = await getRevision(id);
    await updateFileRevision(path, rev);
    const file = fs_1.default.readFileSync(path, "utf8");
    console.log("Uploading id: ", id, ", revision: ", rev, " file: ", path);
    await (0, exports.uploadFile)(id + "/" + pad(rev, 9) + "/script.simba", file);
    const { error } = await supabase
        .from("scripts")
        .update({ revision: rev })
        .match({ id: id });
    if (error)
        console.error(error);
};
for (let i = 0; i < scriptArray.length; i++) {
    run(scriptArray[i].id, dirPath + scriptArray[i].file);
}
if (isLoggedIn)
    supabase.auth.signOut();
