(function () {
    "use strict";

    // Chỉ chạy trên trang có bảng điểm (tránh chèn panel vào trang không liên quan)
    if (!document.querySelector(".score-input")) {
        return;
    }

    var CLIPBOARD_KEY = "epsaf_clipboard";

    // ---------- Helpers ----------

    function parseNum(str) {
        if (str === undefined || str === null) return NaN;
        var s = String(str).trim().replace(",", ".");
        if (s === "") return NaN;
        return parseFloat(s);
    }

    function clamp0to10(n) {
        return Math.min(10, Math.max(0, n));
    }

    function setInputValue(input, value) {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function getStudentCode() {
        var ths = document.querySelectorAll("th");
        for (var i = 0; i < ths.length; i++) {
            if (ths[i].textContent.trim() === "Mã sinh viên") {
                var td = ths[i].nextElementSibling;
                return td ? td.textContent.trim() : "";
            }
        }
        return "";
    }

    // ---------- Group auto-fill ----------

    function fillGroup(type, rawValue) {
        var num = parseNum(rawValue);
        if (isNaN(num)) {
            showToast("Giá trị không hợp lệ");
            return false;
        }
        num = clamp0to10(num);
        var formatted = num.toFixed(1);
        var inputs = document.querySelectorAll('.score-input[data-criteriatype="' + type + '"]');
        if (!inputs.length) {
            showToast("Không tìm thấy nhóm điểm này trên trang");
            return false;
        }
        inputs.forEach(function (inp) {
            if (inp.disabled) return;
            setInputValue(inp, formatted);
        });
        showToast("Đã điền " + inputs.length + " ô, TB = " + formatted);
        return true;
    }

    // ---------- Điền ghi chú hàng loạt ----------

    function fillAllNotes(text, includeGeneral) {
        var noteInputs = document.querySelectorAll(".note-input");
        if (!noteInputs.length && !includeGeneral) {
            showToast("Không tìm thấy ô ghi chú nào trên trang");
            return false;
        }
        noteInputs.forEach(function (inp) {
            if (inp.disabled) return;
            inp.value = text;
            inp.dispatchEvent(new Event("input", { bubbles: true }));
            inp.dispatchEvent(new Event("change", { bubbles: true }));
        });

        var applied = noteInputs.length;
        if (includeGeneral) {
            var generalNoteEl = document.querySelector("#txtGeneralNote");
            if (generalNoteEl && !generalNoteEl.disabled) {
                generalNoteEl.value = text;
                generalNoteEl.dispatchEvent(new Event("input", { bubbles: true }));
                generalNoteEl.dispatchEvent(new Event("change", { bubbles: true }));
                applied++;
            }
        }

        showToast("Đã điền ghi chú cho " + applied + " ô");
        return true;
    }

    // ---------- Copy / Paste giữa các sinh viên ----------

    function collectScores() {
        var data = {};
        document.querySelectorAll(".score-input").forEach(function (inp) {
            var id = inp.getAttribute("data-itemid");
            if (id) data[id] = inp.value;
        });
        return data;
    }

    function collectNotes() {
        var notes = {};
        document.querySelectorAll(".note-input").forEach(function (inp) {
            var id = (inp.id || "").replace("txtNote_", "");
            if (id) notes[id] = inp.value;
        });
        return notes;
    }

    function copyScores() {
        var generalNoteEl = document.querySelector("#txtGeneralNote");
        var payload = {
            studentCode: getStudentCode(),
            scores: collectScores(),
            notes: collectNotes(),
            generalNote: generalNoteEl ? generalNoteEl.value : "",
            savedAt: Date.now()
        };
        chrome.storage.local.set({ epsaf_clipboard: payload }, function () {
            updateStatus("Đã copy điểm + ghi chú từ SV " + (payload.studentCode || "?"));
            showToast("Đã copy điểm và ghi chú");
        });
    }

    function pasteScores() {
        chrome.storage.local.get(CLIPBOARD_KEY, function (res) {
            var payload = res[CLIPBOARD_KEY];
            if (!payload) {
                showToast("Chưa có điểm nào được copy");
                return;
            }

            var applied = 0;
            document.querySelectorAll(".score-input").forEach(function (inp) {
                if (inp.disabled) return;
                var id = inp.getAttribute("data-itemid");
                if (id && payload.scores && payload.scores[id] !== undefined) {
                    setInputValue(inp, payload.scores[id]);
                    applied++;
                }
            });

            if (payload.notes) {
                document.querySelectorAll(".note-input").forEach(function (inp) {
                    var id = (inp.id || "").replace("txtNote_", "");
                    if (id && payload.notes[id] !== undefined) {
                        inp.value = payload.notes[id];
                    }
                });
            }

            var generalNoteEl = document.querySelector("#txtGeneralNote");
            if (generalNoteEl && payload.generalNote !== undefined) {
                generalNoteEl.value = payload.generalNote;
            }

            showToast("Đã dán điểm + ghi chú (" + applied + " mục) từ SV " + (payload.studentCode || "?"));
        });
    }

    function updateStatus(text) {
        var el = document.getElementById("epsaf-status");
        if (el) el.textContent = text;
    }

    function refreshStatusFromStorage() {
        chrome.storage.local.get(CLIPBOARD_KEY, function (res) {
            var payload = res[CLIPBOARD_KEY];
            if (payload) {
                var d = new Date(payload.savedAt);
                updateStatus(
                    "Đã copy từ SV " + (payload.studentCode || "?") +
                    " lúc " + d.toLocaleTimeString()
                );
            } else {
                updateStatus("Chưa copy điểm nào");
            }
        });
    }

    // ---------- Toast ----------

    var toastTimer = null;
    function showToast(msg) {
        var toast = document.getElementById("epsaf-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "epsaf-toast";
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add("epsaf-toast-show");
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toast.classList.remove("epsaf-toast-show");
        }, 2200);
    }

    // ---------- Build panel UI ----------

    function buildPanel() {
        var panel = document.createElement("div");
        panel.id = "epsaf-panel";
        panel.innerHTML =
            '<div id="epsaf-header">' +
                '<span>⚡ Auto điền điểm</span>' +
                '<button type="button" id="epsaf-toggle" title="Thu gọn / Mở rộng">–</button>' +
            "</div>" +
            '<div id="epsaf-body">' +
                '<div class="epsaf-row epsaf-score-row">' +
                    '<label>Tài liệu</label>' +
                    '<input type="text" inputmode="decimal" id="epsaf-tailieu" placeholder="0-10">' +
                    '<button type="button" class="epsaf-fill-btn" data-type="TAILIEUDUAN" data-input="epsaf-tailieu">Điền</button>' +
                "</div>" +
                '<div class="epsaf-row epsaf-score-row">' +
                    '<label>Nhóm</label>' +
                    '<input type="text" inputmode="decimal" id="epsaf-nhom" placeholder="0-10">' +
                    '<button type="button" class="epsaf-fill-btn" data-type="NHOM" data-input="epsaf-nhom">Điền</button>' +
                "</div>" +
                '<div class="epsaf-row epsaf-score-row">' +
                    '<label>Cá nhân</label>' +
                    '<input type="text" inputmode="decimal" id="epsaf-canhan" placeholder="0-10">' +
                    '<button type="button" class="epsaf-fill-btn" data-type="CANHAN" data-input="epsaf-canhan">Điền</button>' +
                "</div>" +
                '<div class="epsaf-row">' +
                    '<label>Ghi chú</label>' +
                    '<input type="text" id="epsaf-note-text" placeholder="Nội dung ghi chú">' +
                    '<button type="button" id="epsaf-fill-notes" class="epsaf-fill-btn">Điền</button>' +
                "</div>" +
                '<label class="epsaf-checkbox-label">' +
                    '<input type="checkbox" id="epsaf-note-include-general"> Áp dụng cho cả Ghi chú chung' +
                "</label>" +
                '<button type="button" id="epsaf-fill-all">Điền tất cả (điểm + ghi chú)</button>' +
                '<hr>' +
                '<div class="epsaf-copy-row">' +
                    '<button type="button" id="epsaf-copy">📋 Copy điểm + ghi chú SV này</button>' +
                    '<button type="button" id="epsaf-paste">📥 Dán điểm + ghi chú vào SV này</button>' +
                "</div>" +
                '<div id="epsaf-status">Chưa copy điểm nào</div>' +
            "</div>";
        document.body.appendChild(panel);

        // Toggle collapse
        var body = panel.querySelector("#epsaf-body");
        var toggleBtn = panel.querySelector("#epsaf-toggle");
        toggleBtn.addEventListener("click", function () {
            var collapsed = body.style.display === "none";
            body.style.display = collapsed ? "" : "none";
            toggleBtn.textContent = collapsed ? "–" : "+";
        });

        // Per-group score fill buttons (ghi chú có nút Điền riêng, xử lý bên dưới)
        panel.querySelectorAll(".epsaf-score-row .epsaf-fill-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var type = btn.getAttribute("data-type");
                var inputId = btn.getAttribute("data-input");
                var val = document.getElementById(inputId).value;
                fillGroup(type, val);
            });
        });

        // Enter key inside group score inputs triggers fill
        panel.querySelectorAll(".epsaf-score-row input").forEach(function (input) {
            input.addEventListener("keydown", function (e) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    var row = input.closest(".epsaf-row");
                    row.querySelector(".epsaf-fill-btn").click();
                }
            });
        });

        // Bulk note fill
        panel.querySelector("#epsaf-fill-notes").addEventListener("click", function () {
            var text = document.getElementById("epsaf-note-text").value;
            var includeGeneral = document.getElementById("epsaf-note-include-general").checked;
            fillAllNotes(text, includeGeneral);
        });
        document.getElementById("epsaf-note-text").addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                panel.querySelector("#epsaf-fill-notes").click();
            }
        });

        // Fill all three score groups + ghi chú cùng lúc (bỏ qua ô nào để trống)
        panel.querySelector("#epsaf-fill-all").addEventListener("click", function () {
            var map = [
                ["TAILIEUDUAN", "epsaf-tailieu"],
                ["NHOM", "epsaf-nhom"],
                ["CANHAN", "epsaf-canhan"]
            ];
            var any = false;
            map.forEach(function (pair) {
                var val = document.getElementById(pair[1]).value;
                if (val !== undefined && val.trim() !== "") {
                    any = fillGroup(pair[0], val) || any;
                }
            });

            var noteText = document.getElementById("epsaf-note-text").value;
            if (noteText !== undefined && noteText.trim() !== "") {
                var includeGeneral = document.getElementById("epsaf-note-include-general").checked;
                any = fillAllNotes(noteText, includeGeneral) || any;
            }

            if (!any) showToast("Chưa nhập điểm hoặc ghi chú nào để điền");
        });

        panel.querySelector("#epsaf-copy").addEventListener("click", copyScores);
        panel.querySelector("#epsaf-paste").addEventListener("click", pasteScores);

        refreshStatusFromStorage();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", buildPanel);
    } else {
        buildPanel();
    }
})();
