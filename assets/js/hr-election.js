
// ------------------------------------------------------------
// 1. Clock
// ------------------------------------------------------------
function updateClock() {
    const timeEl = document.getElementById("time");
    if (!timeEl) return;

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    timeEl.textContent = `${hours}:${minutes}:${seconds}`;
}

setInterval(updateClock, 1000);
updateClock();


// ------------------------------------------------------------
// 2. API endpoints
// ------------------------------------------------------------
const CITIZEN_API =
    "https://script.google.com/macros/s/AKfycbz6FEDTpnZTwqCV2VpIKC3hIWKgvfxtM-BpySCXv1OYlfmZbISA9M6xcrDkXAjTaFJi2w/exec";

const VOTE_API =
    "https://script.google.com/macros/s/AKfycbydOeEVNFmQw39wABY1HyAB5XaNQbGhkmntYQj4W-XJUIiqr_dk9LYpeIC69ZFqIbw/exec";


// ------------------------------------------------------------
// 3. Helpers
// ------------------------------------------------------------
const $ = id => document.getElementById(id);

let citizens = [];

function showLoader(show, message = "กำลังโหลดข้อมูล...") {
    const loader = $("loader");
    const loaderText = $("loader-text");

    if (!loader || !loaderText) return;

    loader.style.display = show ? "flex" : "none";
    loaderText.textContent = message;
}

function showStatus(message, type = "") {
    const el = $("status-message");

    if (!el) {
        if (message) alert(message);
        return;
    }

    el.textContent = message;
    el.className = type;
    el.style.display = message ? "block" : "none";
}

function clearCitizen() {
    if ($("number-zone")) $("number-zone").value = "";
    if ($("line1")) $("line1").textContent = "";
    if ($("line2")) $("line2").textContent = "";
}

function displayCitizen(citizen) {
    $("number-zone").value = citizen["number-zone"] || "";
    $("line1").textContent = citizen.line1 || "";
    $("line2").textContent = citizen.line2 || "";
}


// ------------------------------------------------------------
// 4. Load citizen list
// ------------------------------------------------------------
async function loadCitizen() {
    const select = $("name");

    if (!select) {
        console.error('ไม่พบ element id="name"');
        return;
    }

    clearCitizen();

    try {
        showLoader(true, "กำลังโหลดรายชื่อ...");
        showStatus("");

        const params = new URLSearchParams(location.search);
        const id = params.get("id");

        const response = await fetch(CITIZEN_API, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("ไม่สามารถโหลดข้อมูลได้");
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("รูปแบบข้อมูล API ไม่ถูกต้อง");
        }

        citizens = data;

        select.replaceChildren(
            new Option("-- เลือกชื่อ นามสกุล --", "")
        );

        citizens.forEach(citizen => {
            select.add(
                new Option(
                    citizen.name || "",
                    String(citizen.id)
                )
            );
        });

        select.disabled = false;

        // Auto-select citizen from URL ?id=...
        if (id) {
            const citizen = citizens.find(
                item => String(item.id).trim() === id.trim()
            );

            if (!citizen) {
                throw new Error("ไม่พบข้อมูล id นี้");
            }

            select.value = String(citizen.id);
            displayCitizen(citizen);
        }

    } catch (error) {
        select.disabled = true;
        showStatus(
            error.message || "เกิดข้อผิดพลาด",
            "error"
        );
    } finally {
        showLoader(false);
    }
}


// ------------------------------------------------------------
// 5. Initialize and select citizen
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", loadCitizen);

if ($("name")) {
    $("name").addEventListener("change", () => {
        const citizen = citizens.find(
            item => String(item.id) === $("name").value
        );

        if (!citizen) {
            clearCitizen();
            return;
        }

        displayCitizen(citizen);
        showStatus("");
    });
}


// ------------------------------------------------------------
// 6. Submit vote
// ------------------------------------------------------------
if ($("form")) {
    $("form").addEventListener("submit", async function (event) {
        event.preventDefault();

        const citizen = citizens.find(
            item => String(item.id) === $("name").value
        );

        if (!citizen) {
            showStatus(
                "กรุณาเลือกชื่อ นามสกุลให้ถูกต้อง",
                "error"
            );
            return;
        }

        // ป้องกันชั้นที่ 1
        Client-side duplicate check only
        const submittedKey = "vote-submitted-" + citizen.id;

        if (localStorage.getItem(submittedKey) === "true") {
            showStatus(
                "เบราว์เซอร์นี้บันทึกสถานะว่าส่งบัตรแล้ว",
                "error"
            );
            return;
        }

        // Build payload
        const payload = {
            id: String(citizen.id),
            name: citizen.name || "",
            "number-zone": $("number-zone").value
        };

        for (let i = 1; i <= 10; i++) {
            const voteInput = $("vote" + i);
            payload["vote" + i] = voteInput
                ? voteInput.value.trim()
                : "";
        }

        // Validate candidate numbers
        const votes = Object.keys(payload)
            .filter(key => /^vote\d+$/.test(key))
            .map(key => payload[key])
            .filter(Boolean);

        if (votes.some(v => !/^[1-9]\d*$/.test(v))) {
            showStatus(
                "กรุณากรอกหมายเลขผู้สมัครเป็นเลขจำนวนเต็มบวก",
                "error"
            );
            return;
        }

        if (new Set(votes).size !== votes.length) {
            showStatus(
                "ห้ามลงหมายเลขผู้สมัครซ้ำ",
                "error"
            );
            return;
        }

        if (!confirm("ยืนยันการส่งบัตรเลือกตั้งหรือไม่?")) {
            return;
        }

        const button = $("submit-button");

        if (button) button.disabled = true;

        try {
            showLoader(true, "กำลังส่งข้อมูล...");

            // --------------------------------------------
            // Get public IP
            // --------------------------------------------
            let ip = "";

            try {
                const ipResponse = await fetch(
                    "https://api.ipify.org?format=json",
                    { cache: "no-store" }
                );

                if (!ipResponse.ok) {
                    throw new Error("ไม่สามารถดึง IP ได้");
                }

                const ipData = await ipResponse.json();
                ip = ipData.ip || "";

            } catch (error) {
                console.warn("ดึง IP ไม่ได้:", error);
            }

            // Add IP to JSON payload
            payload.ip = ip;

            // Build key-value pairs if needed elsewhere
            const keyValuePairs = Object.entries(payload).map(
                ([key, value]) =>
                    encodeURIComponent(key) + "=" +
                    encodeURIComponent(String(value ?? ""))
            );

            // Add IP only if not already present
            if (!keyValuePairs.some(
                pair => pair.startsWith("ip=")
            )) {
                keyValuePairs.push(
                    "ip=" + encodeURIComponent(ip)
                );
            }

            // --------------------------------------------
            // Send JSON to Google Apps Script
            // --------------------------------------------
            const response = await fetch(VOTE_API, {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain;charset=utf-8"
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "บันทึกไม่สำเร็จ"
                );
            }

            // Save local browser flag after server success
            // localStorage.setItem(submittedKey, "true");

            showStatus("ส่งข้อมูลสำเร็จ", "success");

            $("form").reset();
            clearCitizen();

        } catch (error) {
            showStatus(
                "ส่งข้อมูลไม่สำเร็จ: " +
                (error.message || "เกิดข้อผิดพลาด"),
                "error"
            );

        } finally {
            showLoader(false);
            if (button) button.disabled = false;
        }
    });
}
