/*
  Copyright (C) 2023 OpaqueGlass

  This program is released under the AGPLv3 license.
  For details, see:
  - License Text: https://www.gnu.org/licenses/agpl-3.0.html
  - License Summary: https://tldrlegal.com/license/gnu-affero-general-public-license-v3-(agpl-3.0)

  THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW. EXCEPT WHEN 
  OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM 
  "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, 
  THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE ENTIRE RISK
  AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, 
  YOU ASSUME THE COST OF ALL NECESSARY SERVICING, REPAIR OR CORRECTION.

  IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING WILL ANY COPYRIGHT HOLDER, 
  OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU 
  FOR DAMAGES, INCLUDING ANY GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF 
  THE USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF DATA OR DATA BEING
  RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD PARTIES OR A FAILURE OF THE PROGRAM TO
  OPERATE WITH ANY OTHER PROGRAMS), EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE
  POSSIBILITY OF SUCH DAMAGES.

*/

const siyuan = require('siyuan');

/**
 * 全局变量
 */
let g_switchTabObserver; // 页签切换与新建监视器
let g_windowObserver; // 窗口监视器
const CONSTANTS = {
    STYLE_ID: "og-file-lost-alarmer-plugin-style",
    ICON_ALL: 2,
    ICON_NONE: 0,
    ICON_CUSTOM_ONLY: 1,
    PLUGIN_NAME: "og_hierachy_navigate",
    SAVE_TIMEOUT: 900,
    POP_NONE: 0,
    POP_LIMIT: 1,
    POP_ALL: 2,
}
let g_writeStorage;
let g_isMobile = false;
let g_mutex = 0;
let g_app;
let g_isRecentClicked = 0; // 判定是否近期点击过文档树
let g_recentClickedId = null;
let g_recentClickCheckTimeout = null; // 等待重新判定timeout
let g_delayTimeMs = 300; // 判定延迟300ms
let g_setting = {
    checkMissingAssets: null, // 检查资源文件
    checkRepoSnapshotSingleTypeCount: null, // 将最近的快照文件数与上次、上上次比较，当文件数量减少超过阈值时提示，设置为0则不提示(只检查.sy、.png、.jpg文件)
    checkLastSnapshotRemoveThreshold: null, // 比较近2个快照的文件删除情况，当删除文件数到达阈值时提示 需要遍历一下，只检查文档、assets文件
    alwaysShowSummaryDialog: null, // 总是展示总结对话框
    checkFileIdExist: null, // 检查指定的文件id是否存在，不存在则提示
    checkLastSnapshot3rdFileLostThreshold: null, 
};
let g_setting_default = {
    checkMissingAssets: true,
    checkRepoSnapshotSingleTypeCount: 50,
    checkLastSnapshotRemoveThreshold: 50,
    alwaysShowSummaryDialog: false,
    checkFileIdExist: "",
    checkLastSnapshot3rdFileLostThreshold: 50,
};
/**
 * Plugin类
 */
class FileLostAlarmerPlugin extends siyuan.Plugin {

    tabOpenObserver =  null;

    onload() {
        g_isMobile = isMobile();
        language = this.i18n;
        g_app = this.app;
        // 读取配置
        // TODO: 读取配置API变更
        Object.assign(g_setting, g_setting_default);
        g_writeStorage = this.saveData;
        this.addIcons(`<symbol id="iconPackageCheck" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 2 2 4-4"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></symbol>`)
        this.addTopBar({
            icon: "iconPackageCheck",
            title: '立即检查最近快照情况',
            callback: checkMain.bind(true)
        });
        
        logPush('FileLostAlarmerPlugin');
    }
    onLayoutReady() {
        this.loadData("settings.json").then((settingCache)=>{
            // 解析并载入配置
            try {
                // let settingData = JSON.parse(settingCache);
                Object.assign(g_setting, settingCache);
                this.eventBusInnerHandler(); 
            }catch(e){
                warnPush("DBT载入配置时发生错误",e);
            }
            // if (!initRetry()) {
            //     setInterval(initRetry, 3000);
            // }
            setTimeout(checkMain, 5000);
            setStyle();
        }, (e)=> {
            debugPush("配置文件读入失败", e);
        });
    }

    onunload() {
        this.el && this.el.remove();
        removeStyle();
        this.eventBusUnbind();
        // 善后
    }
    // TODO: 重写载入设置
    openSetting() {
        // 生成Dialog内容

        // 创建dialog
        const settingDialog = new siyuan.Dialog({
            "title": language["setting_panel_title"],
            "content": `
            <div class="b3-dialog__content" style="flex: 1;">
                <div id="${CONSTANTS.PLUGIN_NAME}-form-content" style="overflow: auto;"></div>
            </div>
            <div class="b3-dialog__action" id="${CONSTANTS.PLUGIN_NAME}-form-action" style="max-height: 40px">
                <button class="b3-button b3-button--cancel">${language["button_cancel"]}</button><div class="fn__space"></div>
                <button class="b3-button b3-button--text">${language["button_save"]}</button>
            </div>
            `,
            "width": isMobile() ? "92vw":"1040px",
            "height": isMobile() ? "50vw":"80vh",
        });
        // console.log("dialog", settingDialog);
        const actionButtons = settingDialog.element.querySelectorAll(`#${CONSTANTS.PLUGIN_NAME}-form-action button`);
        actionButtons[0].addEventListener("click",()=>{settingDialog.destroy()}),
        actionButtons[1].addEventListener("click",()=>{
            // this.writeStorage('hello.txt', 'world' + Math.random().toFixed(2));
            debugPush('SAVING');
            let uiSettings = loadUISettings(settingForm);
            // clearTimeout(g_saveTimeout);
            // g_saveTimeout = setTimeout(()=>{
            this.saveData(`settings.json`, JSON.stringify(uiSettings));
            Object.assign(g_setting, uiSettings);
            removeStyle();
            setStyle();
            try {
                this.eventBusInnerHandler(); 
            }catch(err){
                console.error("og eventBusError", err);
            }
            debugPush("SAVED");
            settingDialog.destroy();
            // }, CONSTANTS.SAVE_TIMEOUT);
        });
        // 绑定dialog和移除操作

        // 生成配置页面
        const hello = document.createElement('div');
        const settingForm = document.createElement("form");
        settingForm.setAttribute("name", CONSTANTS.PLUGIN_NAME);
        settingForm.innerHTML = generateSettingPanelHTML([
            // 基础设定
            new SettingProperty("checkMissingAssets", "SWITCH", null),
            new SettingProperty("checkRepoSnapshotSingleTypeCount", "NUMBER", [0, 1200]),
            new SettingProperty("checkLastSnapshotRemoveThreshold", "NUMBER", [0, 1200]),
            new SettingProperty("checkLastSnapshot3rdFileLostThreshold", "NUMBER", [0, 1200]),
            new SettingProperty("alwaysShowSummaryDialog", "SWITCH", null),
        ]);

        hello.appendChild(settingForm);
        settingDialog.element.querySelector(`#${CONSTANTS.PLUGIN_NAME}-form-content`).appendChild(hello);
    }

    eventBusInnerHandler() {

        // if (true || g_setting.dblclickShowSubDoc) {
        //     document.querySelector('.sy__file')?.addEventListener('click', clickFileTreeHandler, true);
        // } else {
        //     document.querySelector('.sy__file')?.removeEventListener('click', clickFileTreeHandler, true);
        // }
        this.eventBus.on("sync-end", checkMain);
    }
    eventBusUnbind() {
        this.eventBus.off("sync-end", checkMain);
    }
}



// debug push
let g_DEBUG = 5;
const g_NAME = "fla";
const g_FULLNAME = "文件丢失提示";

/*
LEVEL 0 忽略所有
LEVEL 1 仅Error
LEVEL 2 Err + Warn
LEVEL 3 Err + Warn + Info
LEVEL 4 Err + Warn + Info + Log
LEVEL 5 Err + Warn + Info + Log + Debug
*/
function commonPushCheck() {
    if (window.top["OpaqueGlassDebugV2"] == undefined || window.top["OpaqueGlassDebugV2"][g_NAME] == undefined) {
        return g_DEBUG;
    }
    return window.top["OpaqueGlassDebugV2"][g_NAME];
}

function isDebugMode() {
    return commonPushCheck() > g_DEBUG;
}

function debugPush(str, ...args) {
    if (commonPushCheck() >= 5) {
        console.debug(`${g_FULLNAME}[D] ${new Date().toLocaleString()} ${str}`, ...args);
    }
}

function logPush(str, ...args) {
    if (commonPushCheck() >= 4) {
        console.log(`${g_FULLNAME}[L] ${new Date().toLocaleString()} ${str}`, ...args);
    }
}

function errorPush(str, ... args) {
    if (commonPushCheck() >= 1) {
        console.error(`${g_FULLNAME}[E] ${new Date().toLocaleString()} ${str}`, ...args);
    }
}

function warnPush(str, ... args) {
    if (commonPushCheck() >= 2) {
        console.warn(`${g_FULLNAME}[W] ${new Date().toLocaleString()} ${str}`, ...args);
    }
}

class SettingProperty {
    id;
    simpId;
    name;
    desp;
    type;
    limit;
    value;
    /**
     * 设置属性对象
     * @param {*} id 唯一定位id
     * @param {*} type 设置项类型
     * @param {*} limit 限制
     */
    constructor(id, type, limit, value = undefined) {
        this.id = `${CONSTANTS.PLUGIN_NAME}_${id}`;
        this.simpId = id;
        this.name = language[`setting_${id}_name`];
        this.desp = language[`setting_${id}_desp`];
        this.type = type;
        this.limit = limit;
        if (value) {
            this.value = value;
        }else{
            this.value = g_setting[this.simpId];
        }
    }
}


function initRetry() {
    if (!document.querySelector(".sy__file")) {
        logPush("未检测到文档树，终止listener绑定");
        return true;
    }
    document.querySelector('.sy__file')?.addEventListener('click', clickFileTreeHandler, true);
}


async function checkMain(showDialog = false) {
    let data = {
        assetsLostCount: 0,
        repoTotalFileLostCount: 0,
        repoSYFileLostCount: 0,
        repoPNGFileLostCount: 0,
        repoJPGFileLostCount: 0,
        repoLastSnapshotRemoveList: [],
        repoLastSnapshotRemove3rdFileList: [],
        docIdNotExistDetailList: [],
    }
    let needAlert = false;
    data.assetsLostCount = await checkAssets();
    if (data.assetsLostCount > 0) {
        needAlert = true;
    }
    let tempSnapshotNeedAlert = false;
    [tempSnapshotNeedAlert, data.repoSYFileLostCount, data.repoPNGFileLostCount, data.repoJPGFileLostCount,
    data.repoLastSnapshotRemoveList, data.repoLastSnapshotRemove3rdFileList] = await checkRepoSnapshot();
    if (tempSnapshotNeedAlert) {
        needAlert = true;
    }
    debugPush("needAlert", needAlert);
    debugPush("data", data);
    // const totalLost = data.assetsLostCount + data.repoSYFileLostCount + data.repoPNGFileLostCount + data.repoJPGFileLostCount + repoLastSnapshotRemove3rdFileList.length + repoLastSnapshotRemoveList.length + data.docIdNotExistCount;
    // TODO: 检查文件id是否存在
    if (needAlert || (g_setting.alwaysShowSummaryDialog) || showDialog) {
        pushUserWarning(data);
    }
}

async function pushUserWarning(data) {
    let checkResult = {
        assets: getWarningEmoji(data.assetsLostCount, 0),
        fileCount: getWarningEmoji(Math.max(data.repoSYFileLostCount, data.repoPNGFileLostCount, data.repoJPGFileLostCount), g_setting.checkRepoSnapshotSingleTypeCount),
        deleteFileCount: getWarningEmoji(data.repoLastSnapshotRemoveList.length, g_setting.checkLastSnapshotRemoveThreshold),
        delete3rdFileCount: getWarningEmoji(data.repoLastSnapshotRemove3rdFileList.length, g_setting.checkLastSnapshot3rdFileLostThreshold),
        deleteFileIdCount: getWarningEmoji(data.docIdNotExistCount, 0)
    }
    let despMsg = `
    <div style="overflow: scroll; max-height: 70vh">
    ${language["file_lost_warning_desp"]}<br/>
    ${checkResult.assets}${language["assets_lost_warning"].replace("%%", data.assetsLostCount)} <br/>

    ${checkResult.deleteFileCount}${language["critical_lost_warning"].replace("%%",data.repoLastSnapshotRemoveList.length)}
    (${language["file_type_sy"].replace("%%", data.repoSYFileLostCount)}, ${language["file_type_png"].replace("%%", data.repoPNGFileLostCount)}, ${language["file_type_jpg"].replace("%%", data.repoJPGFileLostCount)})<br/>
    ${checkResult.delete3rdFileCount}${language["3rd_lost_warning"].replace("%%", data.repoLastSnapshotRemove3rdFileList.length)}<br/>

    ${language["critical_lost_detail"]}<br/>
    ${JSON.stringify(data.repoLastSnapshotRemoveList)} <br/>
    ${language["3rd_lost_detail"]}<br/>
    ${JSON.stringify(data.repoLastSnapshotRemove3rdFileList)}
    </div>
    `;
    let type = "✅";
    for (let icon in checkResult) {
        if (icon == "❌⚠") {
            type = icon;
            break;
        }
        if (icon == "❓") {
            type = icon;
            break;
        }
    }
    siyuan.confirm(language["file_compare_result_title"].replace("%%", type), despMsg, openRepoDialog);
    if (type == "❌⚠") {
        siyuan.showMessage(language["file_lost_warning"]);
    }
    function getWarningEmoji(test, threshold) {
        if (test > threshold) {
            return "❌⚠"
        } else if (test <= 0) {
            return "✅";
        } else {
            return "❓"
        }
    }
}

function openRepoDialog() {
    dispatchKeyEvent("dataHistory");
    setTimeout(()=>{window.document.querySelector("div[data-key='dialog-history'] .layout-tab-bar [data-type=repo]")?.click()}, 400);
}

async function checkAssets() {
    const missingAssetsList = await getMissingAssets();
    debugPush("missngAssetsList", missingAssetsList);
    if (missingAssetsList != null && missingAssetsList.length > 0) {
        return missingAssetsList.length;
    } else if (missingAssetsList == null) {
        warnPush("网络请求错误，未能检测文件资源丢失情况");
    }
    return 0;
}

async function checkRepoSnapshot() {
    let needAlert = false;
    const snapshotsList = await getSnapshotsList();
    if (!snapshotsList || snapshotsList.length < 3) {
        warnPush("快照数量不足，无法检测文件丢失情况");
        return;
    }
    // 检查总文件数
    let syFileCheck = [];
    let pngFileCheck = [];
    let jpgFileCheck = [];
    let snapshotIds = [];
    for (let i = 0; i < 3; i++) {
        let snapshot = snapshotsList[i];
        snapshotIds.push(snapshot.id);
        debugPush("snapshot", snapshot);
        for (let fileType of snapshot.typesCount) {
            switch (fileType.type) {
                case ".png": {
                    pngFileCheck.push(fileType.count);
                    break;
                }
                case ".jpg": {
                    jpgFileCheck.push(fileType.count);
                    break;
                }
                case ".sy": {
                    syFileCheck.push(fileType.count);
                    break;
                }
                default: {
                    break;
                }
            }
        }
    }
    let syFileGap = syFileCheck[1] - syFileCheck[0];
    let pngFileGap = pngFileCheck[1] - pngFileCheck[0];
    let jpgFileGap = jpgFileCheck[1] - jpgFileCheck[0];
    if (syFileCheck[2] - syFileCheck[0] > syFileGap) {
        syFileGap = syFileCheck[2] - syFileCheck[0];
    }
    if (pngFileCheck[2] - pngFileCheck[0] > pngFileGap) {
        pngFileGap = pngFileCheck[2] - pngFileCheck[0];
    }
    if (jpgFileCheck[2] - jpgFileCheck[0] > jpgFileGap) {
        jpgFileGap = jpgFileCheck[2] - jpgFileCheck[0];
    }
    if (syFileGap > g_setting.checkLastSnapshotRemoveThreshold
        || pngFileGap > g_setting.checkLastSnapshotRemoveThreshold
        || jpgFileGap > g_setting.checkLastSnapshotRemoveThreshold) {
        needAlert = true;
    }
    // 检查文件删除情况
    let diffSnapshots = await getDiffSnapshots(snapshotIds[1], snapshotIds[0]);
    let repoLastSnapshotRemoveList = [];
    let repoLastSnapshotRemove3rdFileList = [];
    if (diffSnapshots && diffSnapshots.removesRight && diffSnapshots.removesRight.length > 0) {
        for (let remove of diffSnapshots.removesRight) {
            if (remove.path.startsWith("/assets") || (remove.path.endsWith(".sy") && !remove.title.includes("Conflicted") )) {
                repoLastSnapshotRemoveList.push(remove.title);
            }
            repoLastSnapshotRemove3rdFileList.push(remove.title);
        }
    }
    if (repoLastSnapshotRemoveList.length > g_setting.checkLastSnapshotRemoveThreshold) {
        needAlert = true;
    }
    if (repoLastSnapshotRemove3rdFileList.length > 0 && g_setting.checkLastSnapshot3rdFileLostThreshold) {

    }
    debugPush("data_list", syFileGap, pngFileGap, jpgFileGap, repoLastSnapshotRemoveList);
    return [needAlert, syFileGap, pngFileGap, jpgFileGap, repoLastSnapshotRemoveList, repoLastSnapshotRemove3rdFileList];
}

async function checkFileIdExist() {
    // 可能需要缓存一下文件名和文件路径，保存在/temp/plugins吧

}



function setStyle() {
    const head = document.getElementsByTagName('head')[0];
    const style = document.createElement('style');
    style.setAttribute("id", CONSTANTS.STYLE_ID);
    

    style.innerHTML = `
    .og-file-lost-dialog-number{
        font-weight: bold;
    }
    `;
    head.appendChild(style);
}

function styleEscape(str) {
    if (!str) return "";
    return str.replace(new RegExp("<[^<]*style[^>]*>", "g"), "");
}

function removeStyle() {
    document.getElementById(CONSTANTS.STYLE_ID)?.remove();
}

/* ************ API 相关 **************** */

async function getMissingAssets() {
    const url = "/api/asset/getMissingAssets";
    let response = await request(url, {});
    debugPush("getMissingAssets", response);
    if (response.code == 0) {
        return response.data.missingAssets;
    }
    return null;
}

async function getSnapshotsList() {
    const url = "/api/repo/getRepoSnapshots";
    let response = await request(url, {page: 1});
    debugPush("getSnapshotsList", response);
    if (response.code == 0) {
        return response.data.snapshots;
    }
    return null;
}

async function getDiffSnapshots(leftId, rightId) {
    const url = "/api/repo/diffRepoSnapshots";
    let response = await request(url, {left: leftId, right: rightId});
    debugPush("diffSnapshots", response);
    if (response.code == 0) {
        return response.data;
    }
    return null;
}

async function checkFileIdExist(docId) {
    // 解析设置项，获取文档id，使用getDocInfo遍历（为了保证及时行，不使用sql）
}

function getNotebooks() {
    let notebooks = window.top.siyuan.notebooks;
    return notebooks;
}


function getFocusedBlock() {
    if (document.activeElement.classList.contains('protyle-wysiwyg')) {
        /* 光标在编辑区内 */
        let block = window.getSelection()?.focusNode?.parentElement; // 当前光标
        while (block != null && block?.dataset?.nodeId == null) block = block.parentElement;
        return block;
    }
    else return null;
}

function getFocusedBlockId() {
    const focusedBlock = getFocusedBlock();
    if (focusedBlock == null) {
        return null;
    }
    return focusedBlock.dataset.nodeId;
}

async function request(url, data) {
    let resData = null;
    await fetch(url, {
        body: JSON.stringify(data),
        method: 'POST'
    }).then(function (response) {
        resData = response.json();
    });
    return resData;
}

async function parseBody(response) {
    let r = await response;
    return r.code === 0 ? r.data : null;
}

async function listDocsByPath({path, notebook = undefined, sort = undefined, maxListLength = undefined}) {
    let data = {
        path: path
    };
    if (notebook) data["notebook"] = notebook;
    if (sort) data["sort"] = sort;
    if (g_setting.docMaxNum != 0) {
        data["maxListCount"] = g_setting.docMaxNum >= 32 ? g_setting.docMaxNum : 32;
    } else {
        data["maxListCount"] = 0;
    }
    let url = '/api/filetree/listDocsByPath';
    return parseBody(request(url, data));
    //文档hepath与Markdown 内容
}

async function sqlAPI(stmt) {
    let data = {
        "stmt": stmt
    };
    let url = `/api/query/sql`;
    return parseBody(request(url, data));
}

async function getTreeStat(id) {
    let data = {
        "id": id
    };
    let url = `/api/block/getTreeStat`;
    return parseBody(request(url, data));
}

async function getDocInfo(id) {
    let data = {
        "id": id
    };
    let url = `/api/block/getDocInfo`;
    return parseBody(request(url, data));
}

async function getKramdown(blockid){
    let data = {
        "id": blockid
    };
    let url = "/api/block/getBlockKramdown";
    let response = await parseBody(request(url, data));
    if (response) {
        return response.kramdown;
    }
}

async function isDocHasAv(docId) {
    let sqlResult = await sqlAPI(`
    SELECT count(*) as avcount FROM blocks WHERE root_id = '${docId}'
    AND type = 'av'
    `);
    debugPush("文档 av判断", sqlResult);
    if (sqlResult.length > 0 && sqlResult[0].avcount > 0) {
        return true;
    } else {
        
        return false;
    }
}

async function isDocEmpty(docId, blockCountThreshold = 0) {
    // 检查父文档是否为空
    let treeStat = await getTreeStat(docId);
    if (blockCountThreshold == 0 && treeStat.wordCount != 0 && treeStat.imageCount != 0) {
        debugPush("treeStat判定文档非空，不插入挂件");
        return false;
    }
    if (blockCountThreshold != 0) {
        let blockCountSqlResult = await sqlAPI(`SELECT count(*) as bcount FROM blocks WHERE root_id like '${docId}' AND type in ('p', 'c', 'iframe', 'html', 'video', 'audio', 'widget', 'query_embed', 't')`);
        if (blockCountSqlResult.length > 0) {
            if (blockCountSqlResult[0].bcount > blockCountThreshold) {
                return false;
            } else {
                return true;
            }
        }
    }
    
    let sqlResult = await sqlAPI(`SELECT markdown FROM blocks WHERE 
        root_id like '${docId}' 
        AND type != 'd' 
        AND (type != 'p' 
           OR (type = 'p' AND length != 0)
           )
        LIMIT 5`);
    if (sqlResult.length <= 0) {
        return true;
    } else {
        debugPush("sql判定文档非空，不插入挂件");
        return false;
    }
    // 获取父文档内容
    let parentDocContent = await getKramdown(docId);
    // 简化判断，过长的父文档内容必定有文本，不插入 // 作为参考，空文档的kramdown长度约为400
    if (parentDocContent.length > 1000) {
        debugPush("父文档较长，认为非空，不插入挂件", parentDocContent.length);
        return;
    }
    // console.log(parentDocContent);
    // 清理ial和换行、空格
    let parentDocPlainText = parentDocContent;
    // 清理ial中的对象信息（例：文档块中的scrool字段），防止后面匹配ial出现遗漏
    parentDocPlainText = parentDocPlainText.replace(new RegExp('\\"{[^\n]*}\\"', "gm"), "\"\"")
    // console.log("替换内部对象中间结果", parentDocPlainText);
    // 清理ial
    parentDocPlainText = parentDocPlainText.replace(new RegExp('{:[^}]*}', "gm"), "");
    // 清理换行
    parentDocPlainText = parentDocPlainText.replace(new RegExp('\n', "gm"), "");
    // 清理空格
    parentDocPlainText = parentDocPlainText.replace(new RegExp(' +', "gm"), "");
    debugPush(`父文档文本（+标记）为 ${parentDocPlainText}`);
    debugPush(`父文档内容为空？${parentDocPlainText == ""}`);
    if (parentDocPlainText != "") return false;
    return true;
}

async function getCurrentDocIdF() {
    let thisDocId;
    thisDocId = window.top.document.querySelector(".layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background")?.getAttribute("data-node-id");
    debugPush("thisDocId by first id", thisDocId);
    if (!thisDocId && g_isMobile) {
        // UNSTABLE: 面包屑样式变动将导致此方案错误！
        try {
            let temp;
            temp = window.top.document.querySelector(".protyle-breadcrumb .protyle-breadcrumb__item .popover__block[data-id]")?.getAttribute("data-id");
            let iconArray = window.top.document.querySelectorAll(".protyle-breadcrumb .protyle-breadcrumb__item .popover__block[data-id]");
            for (let i = 0; i < iconArray.length; i++) {
                let iconOne = iconArray[i];
                if (iconOne.children.length > 0 
                    && iconOne.children[0].getAttribute("xlink:href") == "#iconFile"){
                    temp = iconOne.getAttribute("data-id");
                    break;
                }
            }
            thisDocId = temp;
        }catch(e){
            console.error(e);
            temp = null;
        }
    }
    if (!thisDocId) {
        thisDocId = window.top.document.querySelector(".protyle.fn__flex-1:not(.fn__none) .protyle-background")?.getAttribute("data-node-id");
        debugPush("thisDocId by background must match,  id", thisDocId);
    }
    return thisDocId;
}

function sleep(time){
    return new Promise((resolve) => setTimeout(resolve, time));
}

/**
 * 在点击<span data-type="block-ref">时打开思源块/文档
 * 为引入本项目，和原代码相比有更改
 * @refer https://github.com/leolee9086/cc-template/blob/6909dac169e720d3354d77685d6cc705b1ae95be/baselib/src/commonFunctionsForSiyuan.js#L118-L141
 * @license 木兰宽松许可证
 * @param {点击事件} event 
 */
let openRefLink = function(event, paramId = ""){
    
    let 主界面= window.parent.document
    let id = event?.currentTarget?.getAttribute("data-id") ?? paramId;
    // 处理笔记本等无法跳转的情况
    if (!isValidStr(id)) {return;}
    event?.preventDefault();
    event?.stopPropagation();
    let 虚拟链接 =  主界面.createElement("span")
    虚拟链接.setAttribute("data-type","block-ref")
    虚拟链接.setAttribute("data-id",id)
    虚拟链接.style.display = "none";//不显示虚拟链接，防止视觉干扰
    let 临时目标 = 主界面.querySelector(".protyle-wysiwyg div[data-node-id] div[contenteditable]")
    临时目标.appendChild(虚拟链接);
    let clickEvent = new MouseEvent("click", {
        ctrlKey: event?.ctrlKey,
        shiftKey: event?.shiftKey,
        altKey: event?.altKey,
        bubbles: true
    });
    虚拟链接.dispatchEvent(clickEvent);
    虚拟链接.remove();
}

function isValidStr(s){
    if (s == undefined || s == null || s === '') {
		return false;
	}
	return true;
}


function dispatchKeyEvent(functionName) {
    let keyInit = parseHotKeyStr(window.top.siyuan.config.keymap.general[functionName].custom);
    keyInit["bubbles"] = true;
    let keydownEvent = new KeyboardEvent('keydown', keyInit);
    document.getElementsByTagName("body")[0].dispatchEvent(keydownEvent);
    let keyUpEvent = new KeyboardEvent('keyup', keyInit);
    document.getElementsByTagName("body")[0].dispatchEvent(keyUpEvent);
}

/**
 * 
 * @param {*} hotkeyStr 思源hotkey格式 Refer: https://github.com/siyuan-note/siyuan/blob/d0f011b1a5b12e5546421f8bd442606bf0b5ad86/app/src/protyle/util/hotKey.ts#L4
 * @returns KeyboardEventInit Refer: https://developer.mozilla.org/zh-CN/docs/Web/API/KeyboardEvent/KeyboardEvent
 */
function parseHotKeyStr(hotkeyStr) {
    let result = {
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      key: 'A',
      keyCode: 0
    }
    if (hotkeyStr == "" || hotkeyStr == undefined || hotkeyStr == null) {
      console.error("解析快捷键设置失败", hotkeyStr);
      throw new Error("解析快捷键设置失败");
    }
    let onlyKey = hotkeyStr;
    if (hotkeyStr.indexOf("⌘") != -1) {
      result.ctrlKey = true;
      onlyKey = onlyKey.replace("⌘", "");
    }
    if (hotkeyStr.indexOf("⌥") != -1) {
      result.altKey = true;
      onlyKey = onlyKey.replace("⌥", "");
    }
    if (hotkeyStr.indexOf("⇧") != -1) {
      result.shiftKey = true;
      onlyKey = onlyKey.replace("⇧", "");
    }
    // 未处理 windows btn （MetaKey） 
    result.key = onlyKey;
    // 在https://github.com/siyuan-note/siyuan/commit/70acd57c4b4701b973a8ca93fadf6c003b24c789#diff-558f9f531a326d2fd53151e3fc250ac4bd545452ba782b0c7c18765a37a4e2cc
    // 更改中，思源改为使用keyCode判断快捷键按下事件，这里进行了对应的转换
    // 另请参考该提交中涉及的文件
    result.keyCode = keyCodeList[result.key];
    console.assert(result.keyCode != undefined, `keyCode转换错误,key为${result.key}`);
    switch (result.key) {
      case "→": {
        result.key = "ArrowRight";
        break;
      }
      case "←": {
        result.key = "ArrowLeft";
        break;
      }
      case "↑": {
        result.key = "ArrowUp";
        break;
      }
      case "↓": {
        result.key = "ArrowDown";
        break;
      }
      case "⌦": {
        result.key = "Delete";
        break;
      }
      case "⌫": {
        result.key = "Backspace";
        break;
      }
      case "↩": {
        result.key = "Enter";
        break;
      }
    }
    return result;
}


let zh_CN = {
    
}

let en_US = {}
let language = zh_CN;

/* **************** 设置项相关 *****************
 * 
 */

/**
 * 由需要的设置项生成设置页面
 * @param {*} settingObject 
 */
function generateSettingPanelHTML(settingObjectArray) {
    let resultHTML = "";
    for (let oneSettingProperty of settingObjectArray) {
        let inputElemStr = "";
        oneSettingProperty.desp = oneSettingProperty.desp?.replace(new RegExp("<code>", "g"), "<code class='fn__code'>");
        if (oneSettingProperty.name.includes("🧪")) {
            oneSettingProperty.desp = language["setting_experimental"] + oneSettingProperty.desp;
        }
        let temp = `
        <label class="fn__flex b3-label">
            <div class="fn__flex-1">
                ${oneSettingProperty.name}
                <div class="b3-label__text">${oneSettingProperty.desp??""}</div>
            </div>
            <span class="fn__space"></span>
            *#*##*#*
        </label>
        `;
        switch (oneSettingProperty.type) {
            case "NUMBER": {
                let min = oneSettingProperty.limit[0];
                let max = oneSettingProperty.limit[1];
                inputElemStr = `<input 
                    class="b3-text-field fn__flex-center fn__size200" 
                    id="${oneSettingProperty.id}" 
                    type="number" 
                    name="${oneSettingProperty.simpId}"
                    ${min == null || min == undefined ? "":"min=\"" + min + "\""} 
                    ${max == null || max == undefined ? "":"max=\"" + max + "\""} 
                    value="${oneSettingProperty.value}">`;
                break;
            }
            case "SELECT": {

                let optionStr = "";
                for (let option of oneSettingProperty.limit) {
                    let optionName = option.name;
                    if (!optionName) {
                        optionName = language[`setting_${oneSettingProperty.simpId}_option_${option.value}`];
                    }
                    optionStr += `<option value="${option.value}" 
                    ${option.value == oneSettingProperty.value ? "selected":""}>
                        ${optionName}
                    </option>`;
                }
                inputElemStr = `<select 
                    id="${oneSettingProperty.id}" 
                    name="${oneSettingProperty.simpId}"
                    class="b3-select fn__flex-center fn__size200">
                        ${optionStr}
                    </select>`;
                break;
            }
            case "TEXT": {
                inputElemStr = `<input class="b3-text-field fn__flex-center fn__size200" id="${oneSettingProperty.id}" name="${oneSettingProperty.simpId}" value="${oneSettingProperty.value}"></input>`;
                temp = `
                <label class="fn__flex b3-label config__item">
                    <div class="fn__flex-1">
                        ${oneSettingProperty.name}
                        <div class="b3-label__text">${oneSettingProperty.desp??""}</div>
                    </div>
                    *#*##*#*
                </label>`
                break;
            }
            case "SWITCH": {
                inputElemStr = `<input 
                class="b3-switch fn__flex-center"
                name="${oneSettingProperty.simpId}"
                id="${oneSettingProperty.id}" type="checkbox" 
                ${oneSettingProperty.value?"checked=\"\"":""}></input>
                `;
                break;
            }
            case "TEXTAREA": {
                inputElemStr = `<textarea 
                name="${oneSettingProperty.simpId}"
                class="b3-text-field fn__block" 
                id="${oneSettingProperty.id}">${oneSettingProperty.value}</textarea>`;
                temp = `
                <label class="b3-label fn__flex">
                    <div class="fn__flex-1">
                        ${oneSettingProperty.name}
                        <div class="b3-label__text">${oneSettingProperty.desp??""}</div>
                        <div class="fn__hr"></div>
                        *#*##*#*
                    </div>
                </label>`
                break;
            }
        }
        
        resultHTML += temp.replace("*#*##*#*", inputElemStr);
    }
    // console.log(resultHTML);
    return resultHTML;
}

/**
 * 由配置文件读取配置
 */
function loadCacheSettings() {
    // 检索当前页面所有设置项元素

}

/**
 * 由设置界面读取配置
 */
function loadUISettings(formElement) {
    let data = new FormData(formElement);
    // 扫描标准元素 input[]
    let result = {};
    for(const [key, value] of data.entries()) {
        // console.log(key, value);
        result[key] = value;
        if (value === "on") {
            result[key] = true;
        }else if (value === "null" || value == "false") {
            result[key] = "";
        }
    }
    let checkboxes = formElement.querySelectorAll('input[type="checkbox"]');
    for (let i = 0; i < checkboxes.length; i++) {
        let checkbox = checkboxes[i];
        // console.log(checkbox, checkbox.name, data[checkbox.name], checkbox.name);
        if (result[checkbox.name] == undefined) {
            result[checkbox.name] = false;
        }
    }

    let numbers = formElement.querySelectorAll("input[type='number']");
    // console.log(numbers);
    for (let number of numbers) {
        let minValue = number.getAttribute("min");
        let maxValue = number.getAttribute("max");
        let value = parseFloat(number.value);

        if (minValue !== null && value < parseFloat(minValue)) {
            number.value = minValue;
            result[number.name] = parseFloat(minValue);
        } else if (maxValue !== null && value > parseFloat(maxValue)) {
            number.value = maxValue;
            result[number.name] = parseFloat(maxValue);
        } else {
            result[number.name] = value;
        }
    }

    debugPush("UI SETTING", result);
    return result;
}

function isMobile() {
    return window.top.document.getElementById("sidebar") ? true : false;
};


const keyCodeList = {
    "⌫": 8,
    "⇥": 9,
    "↩": 13,
    "⇧": 16,
    "⌘": 91,
    "⌥": 18,
    "Pause": 19,
    "CapsLock": 20,
    "Escape": 27,
    " ": 32,
    "PageUp": 33,
    "PageDown": 34,
    "End": 35,
    "Home": 36,
    "←": 37,
    "↑": 38,
    "→": 39,
    "↓": 40,
    "PrintScreen": 44,
    "Insert": 45,
    "⌦": 46,
    "0": 48,
    "1": 49,
    "2": 50,
    "3": 51,
    "4": 52,
    "5": 53,
    "6": 54,
    "7": 55,
    "8": 56,
    "9": 57,
    "A": 65,
    "B": 66,
    "C": 67,
    "D": 68,
    "E": 69,
    "F": 70,
    "G": 71,
    "H": 72,
    "I": 73,
    "J": 74,
    "K": 75,
    "L": 76,
    "M": 77,
    "N": 78,
    "O": 79,
    "P": 80,
    "Q": 81,
    "R": 82,
    "S": 83,
    "T": 84,
    "U": 85,
    "V": 86,
    "W": 87,
    "X": 88,
    "Y": 89,
    "Z": 90,
    "ContextMenu": 93,
    "MyComputer": 182,
    "MyCalculator": 183,
    ";": 186,
    "=": 187,
    ",": 188,
    "-": 189,
    ".": 190,
    "/": 191,
    "`": 192,
    "[": 219,
    "\\": 220,
    "]": 221,
    "'": 222,
    "*": 106,
    "+": 107,
    "-": 109,
    ".": 110,
    "/": 111,
    "F1": 112,
    "F2": 113,
    "F3": 114,
    "F4": 115,
    "F5": 116,
    "F6": 117,
    "F7": 118,
    "F8": 119,
    "F9": 120,
    "F10": 121,
    "F11": 122,
    "F12": 123,
    "NumLock": 144,
    "ScrollLock": 145
};

module.exports = {
    default: FileLostAlarmerPlugin,
};