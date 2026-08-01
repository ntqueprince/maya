let hasCalculated = false;

function hideAllMainContent() {
    const dashboardNav = document.querySelector('.top-nav-bar');
    if (dashboardNav) dashboardNav.style.display = 'none';

    const dashboardContainer = document.querySelector('.dashboard-container');
    if (dashboardContainer) dashboardContainer.style.display = 'none';
}

function showAllMainContent() {
    const dashboardNav = document.querySelector('.top-nav-bar');
    if (dashboardNav) dashboardNav.style.display = 'flex';

    const dashboardContainer = document.querySelector('.dashboard-container');
    if (dashboardContainer) dashboardContainer.style.display = 'block';
}

function closeEveryModal() {
    ['csatModal', 'incentiveModal', 'scorecardModal'].forEach((id) => {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'none';
    });
}

function fillPercentSelect(select, min, max, defaultValue, includePlus = true) {
    if (!select) return;
    select.innerHTML = '';

    for (let value = min; value <= max; value++) {
        select.innerHTML += `<option value="${value}">${value}%</option>`;
        if (includePlus && value < max) {
            select.innerHTML += `<option value="${value}+">${value}+%</option>`;
        }
    }

    select.value = String(defaultValue);
}

function fillNumberSelect(select, min, max, suffix, defaultValue) {
    if (!select) return;
    select.innerHTML = '';

    for (let value = min; value <= max; value++) {
        const labelSuffix = typeof suffix === 'function' ? suffix(value) : suffix;
        select.innerHTML += `<option value="${value}">${value} ${labelSuffix}</option>`;
    }

    select.value = String(defaultValue);
}

function initializeDropdowns() {
    fillPercentSelect(document.getElementById('incentiveCSAT'), 80, 100, 90);
    fillPercentSelect(document.getElementById('incentiveQuality'), 40, 100, 90);
    fillNumberSelect(document.getElementById('incentiveAHTMin'), 2, 7, 'Min', 4);
    fillNumberSelect(document.getElementById('incentiveAHTSec'), 0, 59, 'Sec', 30);
    fillNumberSelect(document.getElementById('incentiveAbsent'), 0, 25, (value) => value <= 1 ? 'Day' : 'Days', 0);

    fillPercentSelect(document.getElementById('scCallCSAT'), 0, 100, 90);
    fillPercentSelect(document.getElementById('scTicketCSAT'), 0, 100, 90);
    fillPercentSelect(document.getElementById('scQuality'), 0, 100, 90);
    fillPercentSelect(document.getElementById('scAudit'), 0, 100, 80);
    fillNumberSelect(document.getElementById('scAHTMin'), 0, 15, 'Min', 4);
    fillNumberSelect(document.getElementById('scAHTSec'), 0, 59, 'Sec', 30);
    fillNumberSelect(document.getElementById('scLateLogin'), 0, 31, (value) => value <= 1 ? 'Day' : 'Days', 0);
    fillNumberSelect(document.getElementById('scLoginHrs'), 0, 24, 'Hrs', 9);
    fillNumberSelect(document.getElementById('scLoginMins'), 0, 59, 'Min', 0);
}

window.openCSATModal = function () {
    closeEveryModal();
    const modal = document.getElementById('csatModal');
    if (modal) modal.style.display = 'flex';
    hideAllMainContent();
    calculateCSAT();
};

window.closeCSATModal = function () {
    const modal = document.getElementById('csatModal');
    if (modal) modal.style.display = 'none';

    const goodCount = document.getElementById('goodCount');
    const badCount = document.getElementById('badCount');
    const requiredCSAT = document.getElementById('requiredCSAT');
    const calculateButton = document.getElementById('calculateButton');

    if (goodCount) goodCount.value = '0';
    if (badCount) badCount.value = '0';
    if (requiredCSAT) requiredCSAT.value = '70';
    if (calculateButton) calculateButton.textContent = 'Calculate';

    hasCalculated = false;
    calculateCSAT();
    showAllMainContent();
};

window.calculateCSAT = function () {
    const goodCount = parseInt(document.getElementById('goodCount')?.value) || 0;
    const badCount = parseInt(document.getElementById('badCount')?.value) || 0;
    const requiredCSAT = parseInt(document.getElementById('requiredCSAT')?.value) || 70;
    const resultSection = document.getElementById('csatResult');
    const status = document.getElementById('csatStatus');
    const calculateButton = document.getElementById('calculateButton');

    if (!resultSection || !status || !calculateButton) return;

    const total = goodCount + badCount;
    const csat = total === 0 ? 0 : (goodCount / total) * 100;
    const formattedCSAT = csat.toFixed(2);

    resultSection.querySelector('p:nth-child(1)').textContent = `Total: ${total}`;
    resultSection.querySelector('p:nth-child(2)').textContent = `CSAT: ${formattedCSAT}%`;

    if (total === 0) {
        status.innerHTML = '<span class="shivang-rainbow">SHIVANG</span>';
        status.className = '';
        return;
    }

    const isAboveRequired = csat > requiredCSAT;

    if (isAboveRequired) {
        status.textContent = `Success! CSAT (${formattedCSAT}%) is above required (${requiredCSAT}%+).`;
        status.className = 'success';
    } else if (requiredCSAT >= 100) {
        status.textContent = badCount === 0
            ? 'Already at 100% CSAT.'
            : '100% CSAT cannot be achieved while bad count is above 0.';
        status.className = badCount === 0 ? 'success' : 'error';
    } else {
        const additionalGoodNeeded = Math.floor(((requiredCSAT * total) - (100 * goodCount)) / (100 - requiredCSAT)) + 1;
        const exactCSAT = ((goodCount + additionalGoodNeeded) / (total + additionalGoodNeeded)) * 100;

        status.textContent = `Need ${additionalGoodNeeded} more good count(s) to achieve ${requiredCSAT}%+ (exact: ${exactCSAT.toFixed(2)}%).`;
        status.className = 'error';
    }

    if (!hasCalculated) {
        hasCalculated = true;
        calculateButton.textContent = 'Recalculate';
    }
};

window.openIncentiveModal = function () {
    closeEveryModal();
    const modal = document.getElementById('incentiveModal');
    if (modal) modal.style.display = 'flex';
    hideAllMainContent();
};

window.closeIncentiveModal = function () {
    const modal = document.getElementById('incentiveModal');
    if (modal) modal.style.display = 'none';
    showAllMainContent();
};

function getCSATBaseAmount(csatValue) {
    let csat = parseFloat(csatValue);
    let isPlus = String(csatValue).includes('+');
    let val = isPlus ? csat + 0.1 : csat;

    if (val <= 85) return 0;
    if (val <= 87) return 2000;
    if (val <= 90) return 5000;
    if (val <= 91) return 6000;
    if (val <= 92) return 7000;
    if (val <= 93) return 8000;

    return 10000;
}

function getAHTMultiplier(ahtSecs) {
    if (ahtSecs < 230) return 1.0;
    if (ahtSecs < 290) return 0.95;
    if (ahtSecs < 360) return 0.90;
    return 0.0;
}

function getQualityMultiplier(qualityValue) {
    let quality = parseFloat(qualityValue);
    let isPlus = String(qualityValue).includes('+');
    let val = isPlus ? quality + 0.1 : quality;

    if (val <= 75) return 0.0;
    if (val <= 80) return 0.75;
    if (val <= 85) return 0.90;
    if (val <= 90) return 1.00;

    return 1.10;
}

function getAbsenteeismMultiplier(days) {
    if (days === 0) return 1.10;
    if (days === 1) return 1.00;
    if (days === 2) return 0.95;
    if (days === 3) return 0.90;
    if (days === 4) return 0.85;
    if (days >= 5 && days <= 7) return 0.80;
    if (days >= 8 && days <= 10) return 0.75;
    if (days >= 11 && days <= 15) return 0.70;
    if (days >= 16 && days <= 21) return 0.60;
    if (days >= 22 && days <= 25) return 0.30;
    return 0.0;
}

window.calculateIncentive = function () {
    let csatValue = document.getElementById('incentiveCSAT')?.value;
    let qualityValue = document.getElementById('incentiveQuality')?.value;
    let min = parseInt(document.getElementById('incentiveAHTMin')?.value) || 0;
    let sec = parseInt(document.getElementById('incentiveAHTSec')?.value) || 0;
    let absentDays = parseInt(document.getElementById('incentiveAbsent')?.value) || 0;
    const incentiveResult = document.getElementById('incentiveResult');

    if (!incentiveResult) return;

    let ahtSecs = min * 60 + sec;
    let baseAmount = getCSATBaseAmount(csatValue);
    let ahtMultiplier = getAHTMultiplier(ahtSecs);
    let qualityMultiplier = getQualityMultiplier(qualityValue);
    let absentMultiplier = getAbsenteeismMultiplier(absentDays);

    if (qualityMultiplier === 0) {
        incentiveResult.innerHTML = "<p style='color:red;'>Incentive Cancelled (Quality < 75%)</p>";
        return;
    }

    if (ahtMultiplier === 0) {
        incentiveResult.innerHTML = "<p style='color:red;'>Incentive Cancelled (AHT > 06:00)</p>";
        return;
    }

    let totalIncentive = baseAmount * ahtMultiplier
        + baseAmount * (qualityMultiplier - 1)
        + baseAmount * (absentMultiplier - 1);

    if (totalIncentive < 0) totalIncentive = 0;

    incentiveResult.innerHTML = `
        <p>Base Amount (CSAT): Rs.${baseAmount}</p>
        <p>AHT Multiplier: ${(ahtMultiplier * 100).toFixed(0)}%</p>
        <p>Quality Multiplier: ${(qualityMultiplier * 100).toFixed(0)}%</p>
        <p>Absenteeism Multiplier: ${(absentMultiplier * 100).toFixed(0)}%</p>
        <hr style="margin: 5px 0; border-top: 1px dotted #ccc;">
        <p style="font-size: 1.1em; color: #10b981;">Final Incentive: <b>Rs.${totalIncentive.toFixed(0)}</b></p>
    `;
};

window.toggleIncentiveSlab = function () {
    const container = document.getElementById('incentiveSlabContainer');
    if (!container) return;

    if (container.style.display === 'none' || !container.style.display) {
        container.style.display = 'block';
        container.innerHTML = getSlabHTML();
    } else {
        container.style.display = 'none';
    }
};

function getSlabHTML() {
    const tableStyle = 'width:100%; border-collapse:collapse; margin-bottom:15px; font-size:13px;';
    const thStyle = 'padding:6px 8px; text-align:left; border:1px solid #d1d5db; font-weight:600;';
    const tdStyle = 'padding:5px 8px; border:1px solid #d1d5db; color:#1f2937;';
    const bestTd = 'padding:5px 8px; border:1px solid #d1d5db; color:#047857; font-weight:700; background:#ecfdf5;';
    const worstTd = 'padding:5px 8px; border:1px solid #d1d5db; color:#dc2626; font-weight:700; background:#fef2f2;';
    const altRow = 'background:#f9fafb;';

    return `
        <div style="margin-top:10px;">
            <h4 style="color:#1f2937; margin:10px 0 5px; font-size:14px; font-weight:700;">CSAT Base Amount</h4>
            <table style="${tableStyle}">
                <thead><tr><th style="${thStyle} background:#374151; color:white;">CSAT %</th><th style="${thStyle} background:#374151; color:white;">Base Amount</th></tr></thead>
                <tbody>
                    <tr><td style="${worstTd}"><= 85%</td><td style="${worstTd}">Rs.0</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">85+ - 87%</td><td style="${tdStyle}">Rs.2,000</td></tr>
                    <tr><td style="${tdStyle}">87+ - 90%</td><td style="${tdStyle}">Rs.5,000</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">90+ - 91%</td><td style="${tdStyle}">Rs.6,000</td></tr>
                    <tr><td style="${tdStyle}">91+ - 92%</td><td style="${tdStyle}">Rs.7,000</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">92+ - 93%</td><td style="${tdStyle}">Rs.8,000</td></tr>
                    <tr><td style="${bestTd}">93+ %</td><td style="${bestTd}">Rs.10,000</td></tr>
                </tbody>
            </table>
            <h4 style="color:#1f2937; margin:10px 0 5px; font-size:14px; font-weight:700;">AHT Multiplier</h4>
            <table style="${tableStyle}">
                <thead><tr><th style="${thStyle} background:#374151; color:white;">AHT</th><th style="${thStyle} background:#374151; color:white;">Multiplier</th></tr></thead>
                <tbody>
                    <tr><td style="${bestTd}">< 3:50</td><td style="${bestTd}">100%</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">3:50 - 4:49</td><td style="${tdStyle}">95%</td></tr>
                    <tr><td style="${tdStyle}">4:50 - 5:59</td><td style="${tdStyle}">90%</td></tr>
                    <tr><td style="${worstTd}">>= 6:00</td><td style="${worstTd}">0% (Cancel)</td></tr>
                </tbody>
            </table>
            <h4 style="color:#1f2937; margin:10px 0 5px; font-size:14px; font-weight:700;">Quality Multiplier</h4>
            <table style="${tableStyle}">
                <thead><tr><th style="${thStyle} background:#374151; color:white;">Quality %</th><th style="${thStyle} background:#374151; color:white;">Multiplier</th></tr></thead>
                <tbody>
                    <tr><td style="${worstTd}"><= 75%</td><td style="${worstTd}">0% (Cancel)</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">75+ - 80%</td><td style="${tdStyle}">75%</td></tr>
                    <tr><td style="${tdStyle}">80+ - 85%</td><td style="${tdStyle}">90%</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">85+ - 90%</td><td style="${tdStyle}">100%</td></tr>
                    <tr><td style="${bestTd}">90+ %</td><td style="${bestTd}">110%</td></tr>
                </tbody>
            </table>
            <h4 style="color:#1f2937; margin:10px 0 5px; font-size:14px; font-weight:700;">Absenteeism Multiplier</h4>
            <table style="${tableStyle}">
                <thead><tr><th style="${thStyle} background:#374151; color:white;">Absent Days</th><th style="${thStyle} background:#374151; color:white;">Multiplier</th></tr></thead>
                <tbody>
                    <tr><td style="${bestTd}">0 Day</td><td style="${bestTd}">110%</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">1 Day</td><td style="${tdStyle}">100%</td></tr>
                    <tr><td style="${tdStyle}">2 Days</td><td style="${tdStyle}">95%</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">3 Days</td><td style="${tdStyle}">90%</td></tr>
                    <tr><td style="${tdStyle}">4 Days</td><td style="${tdStyle}">85%</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">5-7 Days</td><td style="${tdStyle}">80%</td></tr>
                    <tr><td style="${tdStyle}">8-10 Days</td><td style="${tdStyle}">75%</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">11-15 Days</td><td style="${tdStyle}">70%</td></tr>
                    <tr><td style="${tdStyle}">16-21 Days</td><td style="${tdStyle}">60%</td></tr>
                    <tr><td style="${worstTd}">22-25 Days</td><td style="${worstTd}">30%</td></tr>
                </tbody>
            </table>
        </div>
    `;
}

window.openScorecardModal = function () {
    closeEveryModal();
    const modal = document.getElementById('scorecardModal');
    if (modal) modal.style.display = 'flex';
    hideAllMainContent();
};

window.closeScorecardModal = function () {
    const modal = document.getElementById('scorecardModal');
    if (modal) modal.style.display = 'none';
    showAllMainContent();
};

function getScCallCSAT(tenure, val) {
    if (tenure === '0-3') {
        if (val <= 80) return 0;
        if (val <= 85) return 15;
        if (val <= 90) return 20;
        return 30;
    }
    if (val <= 81) return 0;
    if (val <= 86) return 15;
    if (val <= 92) return 20;
    return 30;
}

function getScTicketCSAT(tenure, val) {
    if (tenure === '0-3') {
        if (val <= 80) return 0;
        if (val <= 85) return 2;
        if (val <= 88) return 3;
        return 5;
    }
    if (val <= 80) return 0;
    if (val <= 85) return 2;
    if (val <= 90) return 3;
    return 5;
}

function getScAHT(tenure, secs) {
    if (tenure === '0-3') {
        if (secs < 285) return 20;
        if (secs <= 300) return 15;
        if (secs <= 315) return 10;
        return 0;
    }
    if (tenure === '3-6') {
        if (secs < 270) return 20;
        if (secs <= 285) return 15;
        if (secs <= 300) return 10;
        return 0;
    }
    if (secs < 255) return 20;
    if (secs <= 270) return 15;
    if (secs <= 285) return 10;
    return 0;
}

function getScQuality(tenure, val) {
    if (tenure === '0-3') {
        if (val <= 80) return 0;
        if (val <= 85) return 7;
        if (val <= 87) return 10;
        return 15;
    }
    if (tenure === '3-6') {
        if (val <= 80) return 0;
        if (val <= 85) return 7;
        if (val <= 89) return 10;
        return 15;
    }
    if (val <= 80) return 0;
    if (val <= 85) return 7;
    if (val <= 90) return 10;
    return 15;
}

function getScAudit(val) {
    if (val <= 70) return 0;
    if (val <= 75) return 5;
    if (val <= 80) return 7;
    return 10;
}

function getScLateLogin(days) {
    if (days <= 1) return 10;
    if (days === 2) return 5;
    return 0;
}

function getScLoginHrs(mins) {
    if (mins < 420) return 0;
    if (mins <= 450) return 5;
    if (mins < 470) return 7;
    return 10;
}

function getScPerformanceRating(score) {
    if (score <= 61) return 'C';
    if (score <= 70) return 'B';
    if (score <= 81) return 'B+';
    if (score <= 86) return 'A-';
    if (score <= 91) return 'A';
    return 'A+';
}

window.calculateScorecard = function () {
    let tenure = document.getElementById('scTenure')?.value;
    const parseParam = (str) => String(str).includes('+') ? parseFloat(str) + 0.1 : parseFloat(str);

    let callCsat = parseParam(document.getElementById('scCallCSAT')?.value);
    let ticCsat = parseParam(document.getElementById('scTicketCSAT')?.value);
    let qual = parseParam(document.getElementById('scQuality')?.value);
    let audit = parseParam(document.getElementById('scAudit')?.value);
    let ahtMin = parseInt(document.getElementById('scAHTMin')?.value) || 0;
    let ahtSec = parseInt(document.getElementById('scAHTSec')?.value) || 0;
    let lateLogin = parseInt(document.getElementById('scLateLogin')?.value) || 0;
    let logHrs = parseInt(document.getElementById('scLoginHrs')?.value) || 0;
    let logMins = parseInt(document.getElementById('scLoginMins')?.value) || 0;
    const scorecardResult = document.getElementById('scorecardResult');

    if (!scorecardResult) return;

    let ahtSecsTotal = (ahtMin * 60) + ahtSec;
    let loginMinTotal = (logHrs * 60) + logMins;

    let ptCall = getScCallCSAT(tenure, callCsat);
    let ptTic = getScTicketCSAT(tenure, ticCsat);
    let ptAht = getScAHT(tenure, ahtSecsTotal);
    let ptQual = getScQuality(tenure, qual);
    let ptAud = getScAudit(audit);
    let ptLate = getScLateLogin(lateLogin);
    let ptLog = getScLoginHrs(loginMinTotal);

    let totalScore = ptCall + ptTic + ptAht + ptQual + ptAud + ptLate + ptLog;
    let performanceRating = getScPerformanceRating(totalScore);

    scorecardResult.innerHTML = `
        <p style="text-align:center; margin-bottom:10px;"><span class="colorful-text" style="font-size:0.9em;">Created by Shivang</span></p>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>Calling CSAT:</span> <b>${ptCall} / 30</b></div>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>Ticket CSAT:</span> <b>${ptTic} / 5</b></div>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>AHT IB+CTC:</span> <b>${ptAht} / 20</b></div>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>Quality:</span> <b>${ptQual} / 15</b></div>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>Internal Audit:</span> <b>${ptAud} / 10</b></div>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>Late Login:</span> <b>${ptLate} / 10</b></div>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>Login Hour:</span> <b>${ptLog} / 10</b></div>
        <div style="text-align:center; margin-top:15px;">
            <p style="font-size: 1.3em; color: #0f766e; margin:0;">Total Score: <b>${totalScore} / 100</b></p>
            <p style="display:inline-block; margin:8px 0 0; padding:6px 16px; border-radius:999px; background:#ede9fe; color:#6d28d9; font-size:1.15em; font-weight:700;">Rating: ${performanceRating}</p>
        </div>
    `;
};

document.addEventListener('DOMContentLoaded', function () {
    initializeDropdowns();

    ['csatModal', 'incentiveModal', 'scorecardModal'].forEach((id) => {
        const modal = document.getElementById(id);
        if (!modal) return;

        modal.addEventListener('click', function (event) {
            if (event.target !== modal) return;

            if (id === 'csatModal') closeCSATModal();
            if (id === 'incentiveModal') closeIncentiveModal();
            if (id === 'scorecardModal') closeScorecardModal();
        });
    });
});
