

// #region 🔒 FIREBASE & IMAGE UPLOAD
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getDatabase, ref as dbRef, push, onValue, remove, serverTimestamp, set, get, update } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm";

// Your web app's Firebase configuration (using config from structure.html)
const firebaseConfig = {
    apiKey: "AIzaSyCIfleywEbd1rcjymkfEfFYxPpvYdZHGhk",
    authDomain: "cvang-vahan.firebaseapp.com",
    databaseURL: "https://cvang-vahan-default-rtdb.firebaseio.com",
    projectId: "cvang-vahan",
    storageBucket: "cvang-vahan.appspot.com",
    messagingSenderId: "117318825099",
    appId: "1:117318825099:web:afc0e2f863117cb14bfc"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const imagesRef = dbRef(db, 'images');

// Cloudinary configuration (from structure.html)
const cloudName = 'dugehr9nl'; // Replace with your Cloudinary cloud name
const uploadPreset = 'anonymous_upload'; // Replace with your Cloudinary upload preset
// ✅ Handle paste event for images
document.addEventListener("paste", function (event) {
    const clipboardData = event.clipboardData || event.originalEvent?.clipboardData;
    const items = Array.from(clipboardData?.items || []);
    const imageFiles = items
        .filter(item => item.type && item.type.indexOf("image") === 0)
        .map(item => item.getAsFile())
        .filter(Boolean);

    if (!imageFiles.length) return;

    event.preventDefault();

    const tagInput = document.getElementById("tagInput");
    const passwordInput = document.getElementById("passwordInput");
    const progressBar = document.getElementById("progress");
    const statusText = document.getElementById("status");
    const tag = tagInput?.value.trim() || "ClipboardImage";
    const password = passwordInput?.value.trim() || "";

    let completedCount = 0;
    let successCount = 0;
    const totalFiles = imageFiles.length;

    statusText.textContent = totalFiles > 1 ? `Uploading ${totalFiles} pasted images...` : 'Uploading pasted image...';

    imageFiles.forEach((file, index) => {
        const safeName = file.name && file.name !== 'image.png'
            ? file.name
            : `clipboard-image-${Date.now()}-${index + 1}.png`;
        const normalizedFile = new File([file], safeName, { type: file.type || 'image/png' });

        uploadFile(normalizedFile, tag, password, progressBar, statusText, null, (success) => {
            completedCount++;
            if (success) successCount++;
            if (completedCount >= totalFiles) {
                if (successCount === totalFiles) {
                    showMessage(`${totalFiles} pasted image(s) uploaded successfully!`, 'info');
                } else if (successCount > 0) {
                    showMessage(`${successCount}/${totalFiles} pasted image(s) uploaded. ${totalFiles - successCount} failed.`, 'error');
                }
                if (passwordInput) passwordInput.value = '';
            }
        });
    });
});


// Global variables
let selectedFile = null;
let selectedFiles = [];
let pendingFiles = []; // Files queued for upload with preview
let hasCalculated = false;
const uploadingImageUrls = new Set();
const uploadingImageKeys = new Set();

function isImageFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith('image/')) return true;
    return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name || '');
}

function getUploadErrorMessage(reason, fileName = '') {
    const nameText = fileName ? `\nFile: ${fileName}` : '';
    const details = reason ? `\nReason: ${reason}` : '';
    return `Photo upload failed.${nameText}${details}\n\nPlease check your browser/system upload permission and internet connection. Please try again.`;
}

function showUploadErrorPopup(reason, fileName = '') {
    const existingPopup = document.querySelector('.upload-error-popup');
    if (existingPopup) existingPopup.remove();

    const overlay = document.createElement('div');
    overlay.className = 'upload-error-popup';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '10000';
    overlay.style.background = 'rgba(15, 23, 42, 0.55)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '18px';

    const box = document.createElement('div');
    box.style.width = 'min(420px, 100%)';
    box.style.background = '#ffffff';
    box.style.color = '#111827';
    box.style.borderRadius = '8px';
    box.style.boxShadow = '0 18px 40px rgba(0,0,0,0.28)';
    box.style.padding = '22px';
    box.style.fontFamily = 'Poppins, Arial, sans-serif';
    box.style.textAlign = 'left';

    const title = document.createElement('h3');
    title.textContent = 'Photo Upload Failed';
    title.style.margin = '0 0 10px';
    title.style.fontSize = '20px';
    title.style.fontWeight = '700';
    title.style.color = '#dc2626';

    const message = document.createElement('p');
    message.textContent = getUploadErrorMessage(reason, fileName);
    message.style.margin = '0';
    message.style.whiteSpace = 'pre-line';
    message.style.lineHeight = '1.5';
    message.style.fontSize = '14px';

    const okButton = document.createElement('button');
    okButton.type = 'button';
    okButton.textContent = 'OK';
    okButton.style.marginTop = '18px';
    okButton.style.width = '100%';
    okButton.style.padding = '10px 14px';
    okButton.style.border = '0';
    okButton.style.borderRadius = '6px';
    okButton.style.background = '#dc2626';
    okButton.style.color = '#ffffff';
    okButton.style.fontWeight = '700';
    okButton.style.cursor = 'pointer';
    okButton.onclick = () => overlay.remove();

    box.appendChild(title);
    box.appendChild(message);
    box.appendChild(okButton);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

function reportUploadFailure(reason, fileName = '', statusText = null) {
    const message = getUploadErrorMessage(reason, fileName);
    if (statusText) statusText.textContent = 'Upload failed';
    showMessage(message, 'error');
    showUploadErrorPopup(reason, fileName);
}

function getCloudinaryErrorMessage(xhr) {
    try {
        const response = JSON.parse(xhr.responseText || '{}');
        if (response?.error?.message) return response.error.message;
    } catch (error) {
        // Keep fallback below when response is not JSON.
    }
    return xhr.status ? `Server returned status ${xhr.status}` : 'Upload request failed';
}

// Toggle password visibility
window.togglePasswordVisibility = function (inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
    } else {
        input.type = 'password';
        btn.textContent = '👁';
    }
};

// Expose functions to window object

// ✅ File Preview Logic - renders thumbnails with delete option
function renderFilePreview() {
    const container = document.getElementById('filePreviewContainer');
    container.innerHTML = '';

    if (pendingFiles.length === 0) {
        return;
    }

    pendingFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-preview-item';

        const img = document.createElement('img');
        try {
            img.src = URL.createObjectURL(file);
        } catch (error) {
            reportUploadFailure('The browser or system did not allow the selected photo preview.', file.name);
            return;
        }
        img.alt = file.name;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'file-preview-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Remove this file';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            pendingFiles.splice(index, 1);
            renderFilePreview();
            // Agar sab files remove ho gayi to file input bhi reset karo
            if (pendingFiles.length === 0) {
                document.getElementById('fileUpload').value = '';
            }
        };

        const nameLabel = document.createElement('div');
        nameLabel.className = 'file-preview-name';
        nameLabel.textContent = file.name;

        item.appendChild(img);
        item.appendChild(removeBtn);
        item.appendChild(nameLabel);
        container.appendChild(item);
    });
}

// ✅ Listen for file input changes to show preview
document.getElementById('fileUpload').addEventListener('change', function () {
    try {
        const selected = Array.from(this.files || []);
        const invalidFiles = selected.filter(file => !isImageFile(file));
        pendingFiles = selected.filter(isImageFile);

        if (invalidFiles.length) {
            reportUploadFailure('Only image files are allowed. Please select JPG, PNG, GIF, WebP, BMP, HEIC, or HEIF photos.', invalidFiles[0].name);
        }

        if (selected.length && !pendingFiles.length) {
            this.value = '';
        }

        renderFilePreview();
    } catch (error) {
        pendingFiles = [];
        this.value = '';
        renderFilePreview();
        reportUploadFailure('The browser or system blocked access to the selected photo.');
    }
});

// Multiple Image Upload Function
window.uploadImage = function () {
    const uploadBtn = document.querySelector(".colorful-upload-btn");

    const tagInput = document.getElementById("tagInput");
    const tag = tagInput.value.trim();
    const password = document.getElementById("passwordInput").value.trim();
    const progressBar = document.getElementById("progress");
    const statusText = document.getElementById("status");

    // Use pendingFiles instead of fileInput.files
    if (!pendingFiles.length) {
        reportUploadFailure('Please select at least one photo before upload.');
        return;
    }

    const invalidFiles = pendingFiles.filter(file => !isImageFile(file));
    if (invalidFiles.length) {
        reportUploadFailure('Only image files are allowed.', invalidFiles[0].name);
        return;
    }

    uploadBtn.style.display = "none"; // Upload button ko hide kar do

    if (!tag) {
        // Agar tag blank hai to modal open karo
        selectedFiles = [...pendingFiles];
        document.getElementById("tagModal").style.display = "flex";
        return;
    }

    // Reset progress bar to 0%
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    statusText.textContent = 'Ready';

    // ✅ Loop through all pending files
    let completedCount = 0;
    let successCount = 0;
    const totalFiles = pendingFiles.length;

    pendingFiles.forEach((file) => {
        uploadFile(file, tag, password, progressBar, statusText, null, (success) => {
            completedCount++;
            if (success) successCount++;
            if (completedCount >= totalFiles) {
                // Sab files complete hone par button wapas dikhao
                uploadBtn.style.display = "inline-block";
                if (successCount === totalFiles) {
                    showMessage(`${totalFiles} image(s) uploaded successfully!`, 'info');
                    document.getElementById('passwordInput').value = ''; // Clear password
                } else if (successCount > 0) {
                    showMessage(`${successCount}/${totalFiles} image(s) uploaded. ${totalFiles - successCount} failed.`, 'error');
                } else {
                    showMessage('Photo upload failed. Please try again.', 'error');
                }
            }
        });
    });

    // Clear preview and reset
    pendingFiles = [];
    renderFilePreview();
    document.getElementById('fileUpload').value = '';
};


window.closeModal = function () {
    document.getElementById('tagModal').style.display = 'none';
    document.getElementById('modalTagInput').value = '';
    document.getElementById('modalTagInput').style.display = 'inline-block'; // Re-show input field
    document.getElementById('modalPasswordInput').value = ''; // Clear modal password
    const pwWrapper = document.querySelector('#tagModal .password-field-wrapper');
    if (pwWrapper) pwWrapper.style.display = 'inline-flex'; // Re-show password field
    document.getElementById('modalProgressContainer').style.display = 'none';
    document.getElementById('modalProgress').style.width = '0%';
    document.getElementById('modalProgress').textContent = '0%';
    // Reset modal heading back to default
    const modalHeading = document.getElementById('modalHeading');
    if (modalHeading) modalHeading.textContent = '⚠️ Tag is required!';
    const modalStatus = document.getElementById('modalStatus');
    if (modalStatus) modalStatus.textContent = 'Uploading...';
    document.querySelector('.modal-content .upload-btn').style.display = 'inline-block'; // Show buttons again
    document.querySelector('.modal-content .cancel-btn').style.display = 'inline-block'; // Show buttons again
    // Re-show the main upload button that was hidden
    const uploadBtn = document.querySelector(".colorful-upload-btn");
    if (uploadBtn) uploadBtn.style.display = "inline-block";
    // Reset main progress bar
    document.getElementById('progress').style.width = '0%';
    document.getElementById('progress').textContent = '0%';
    document.getElementById('status').textContent = 'Ready';
    selectedFile = null; // Clear selected file
    selectedFiles = []; // Clear selected files
    pendingFiles = []; // Clear pending files
    renderFilePreview(); // Clear file preview
    document.getElementById('fileUpload').value = ''; // Reset file input
};

window.submitTag = function () {
    const modalTagInput = document.getElementById('modalTagInput');
    const tag = modalTagInput.value.trim();
    const password = document.getElementById('modalPasswordInput').value.trim();
    const progressBar = document.getElementById('progress');
    const statusText = document.getElementById('status');
    const modalProgress = document.getElementById('modalProgress');
    const modalProgressContainer = document.getElementById('modalProgressContainer');

    if (!tag) {
        showMessage("Tag is required!", "error");
        return;
    }

    // Reset progress bars
    modalProgress.style.width = '0%';
    modalProgress.textContent = '0%';
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    statusText.textContent = 'Uploading...';

    // Change modal heading to uploading state
    const modalHeading = document.getElementById('modalHeading');
    if (modalHeading) modalHeading.textContent = '📤 Uploading...';
    const modalStatus = document.getElementById('modalStatus');
    if (modalStatus) modalStatus.textContent = 'Starting upload...';

    modalProgressContainer.style.display = 'block';
    document.querySelector('.modal-content .upload-btn').style.display = 'none';
    document.querySelector('.modal-content .cancel-btn').style.display = 'none';
    // Input fields bhi hide karo uploading ke dauran
    modalTagInput.style.display = 'none';
    document.querySelector('#tagModal .password-field-wrapper').style.display = 'none';

    // ✅ Multiple files handle
    const filesToUpload = selectedFiles.length > 0 ? selectedFiles : (selectedFile ? [selectedFile] : []);

    if (filesToUpload.length === 0) {
        reportUploadFailure('No files to upload. Please select a photo again.');
        document.querySelector('.modal-content .upload-btn').style.display = 'inline-block';
        document.querySelector('.modal-content .cancel-btn').style.display = 'inline-block';
        return;
    }

    let completedCount = 0;
    let successCount = 0;
    const totalFiles = filesToUpload.length;

    filesToUpload.forEach((file) => {
        uploadFile(file, tag, password, progressBar, statusText, modalProgress, (success) => {
            completedCount++;
            if (success) successCount++;
            if (completedCount >= totalFiles) {
                // Sab files upload ho gayi — ab modal band karo
                setTimeout(() => {
                    closeModal();
                    if (successCount === totalFiles) {
                        showMessage(`${totalFiles} image(s) uploaded successfully!`, 'info');
                    } else if (successCount > 0) {
                        showMessage(`${successCount}/${totalFiles} image(s) uploaded. ${totalFiles - successCount} failed.`, 'error');
                    } else {
                        showMessage('Photo upload failed. Please try again.', 'error');
                    }
                }, 800);
            }
        });
    });

    selectedFiles = [];
    selectedFile = null;
};

function setUploadProgress(progressBar, statusText, modalProgress, percent, label = 'Uploading') {
    const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
    const progressText = `${safePercent}%`;
    progressBar.style.width = progressText;
    progressBar.textContent = progressText;
    statusText.textContent = `${label}... ${progressText}`;

    if (modalProgress) {
        modalProgress.style.width = progressText;
        modalProgress.textContent = progressText;
    }

    const modalStatus = document.getElementById('modalStatus');
    if (modalStatus) modalStatus.textContent = `${label}... ${progressText}`;
}

function createUploadProgressAnimator(progressBar, statusText, modalProgress) {
    let currentPercent = 1;
    let targetPercent = 1;
    let currentLabel = 'Preparing upload';
    let timerId = null;

    const render = () => {
        setUploadProgress(progressBar, statusText, modalProgress, currentPercent, currentLabel);
    };

    const step = () => {
        if (currentPercent >= targetPercent) return;

        const gap = targetPercent - currentPercent;
        const increment = gap > 30 ? 2 : 1;
        currentPercent = Math.min(targetPercent, currentPercent + increment);
        render();
    };

    const start = () => {
        if (timerId) return;
        render();
        timerId = setInterval(step, 90);
    };

    const moveTo = (percent, label = currentLabel) => {
        currentLabel = label;
        targetPercent = Math.max(targetPercent, Math.min(100, Math.round(percent)));
        start();
    };

    const finish = (label = 'Complete') => {
        currentLabel = label;
        targetPercent = 100;
        if (timerId) clearInterval(timerId);
        timerId = setInterval(() => {
            if (currentPercent >= 100) {
                clearInterval(timerId);
                timerId = null;
                render();
                return;
            }

            currentPercent = Math.min(100, currentPercent + 1);
            render();
        }, 45);
    };

    const stop = () => {
        if (timerId) clearInterval(timerId);
        timerId = null;
    };

    start();
    return { moveTo, finish, stop };
}

function waitForGalleryImageRendered({ imageUrl, imageKey }, timeoutMs = 12000) {
    return new Promise((resolve) => {
        const gallery = document.getElementById('gallery');
        if (!gallery) {
            resolve(false);
            return;
        }

        let settled = false;
        let observer = null;
        let timeoutId = null;

        const finish = (didRender) => {
            if (settled) return;
            settled = true;
            if (observer) observer.disconnect();
            if (timeoutId) clearTimeout(timeoutId);
            resolve(didRender);
        };

        const imageMatches = (img) => {
            if (imageKey && img.closest(`[data-image-key="${imageKey}"]`)) {
                return true;
            }

            const src = img.currentSrc || img.src || '';
            return src === imageUrl || src.startsWith(imageUrl);
        };

        const resolveAfterPaint = () => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => finish(true));
            });
        };

        const watchImage = (img) => {
            if (img.complete && img.naturalWidth > 0) {
                resolveAfterPaint();
                return true;
            }

            img.addEventListener('load', resolveAfterPaint, { once: true });
            img.addEventListener('error', () => finish(false), { once: true });
            return false;
        };

        const scanGallery = () => {
            const galleryImages = Array.from(gallery.querySelectorAll('.image-container img'));
            const img = galleryImages.find(imageMatches) || galleryImages[0];
            if (!img) return false;
            return watchImage(img);
        };

        if (scanGallery()) return;

        observer = new MutationObserver(scanGallery);
        observer.observe(gallery, { childList: true, subtree: true });
        timeoutId = setTimeout(() => {
            const renderedImage = Array.from(gallery.querySelectorAll('.image-container img'))
                .some(img => img.complete && img.naturalWidth > 0);
            finish(renderedImage);
        }, timeoutMs);
    });
}

function uploadFile(file, tag, password, progressBar, statusText, modalProgress, onComplete) {
    if (!isImageFile(file)) {
        reportUploadFailure('Selected file is not a valid image.', file?.name || '', statusText);
        if (onComplete) onComplete(false);
        return;
    }

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    const maxAttempts = 3;
    const retryDelays = [1200, 2500];

    const createFormData = () => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', uploadPreset);
        formData.append('tags', tag);
        return formData;
    };

    let formData = null;
    try {
        formData = createFormData();
    } catch (error) {
        reportUploadFailure('The browser or system blocked access to the selected photo.', file?.name || '', statusText);
        if (onComplete) onComplete(false);
        return;
    }

    const progressAnimator = createUploadProgressAnimator(progressBar, statusText, modalProgress);
    progressAnimator.moveTo(8, 'Preparing upload');

    const shouldRetryStatus = (status) => status === 0 || status === 408 || status === 429 || status >= 500;

    const retryUpload = (attempt, reason) => {
        if (attempt >= maxAttempts) return false;
        const nextAttempt = attempt + 1;
        const delay = retryDelays[attempt - 1] || 2500;
        console.warn(`Upload attempt ${attempt} failed. Retrying...`, reason || '');
        progressAnimator.moveTo(Math.min(20 + attempt * 8, 45), `Retrying upload ${nextAttempt}/${maxAttempts}`);
        setTimeout(() => {
            try {
                formData = createFormData();
                startUploadAttempt(nextAttempt);
            } catch (error) {
                progressAnimator.stop();
                reportUploadFailure('The browser or system blocked access to the selected photo.', file?.name || '', statusText);
                if (onComplete) onComplete(false);
            }
        }, delay);
        return true;
    };

    function startUploadAttempt(attempt) {
        const xhr = new XMLHttpRequest();
        xhr.timeout = attempt === 1 ? 60000 : 90000;

        xhr.upload.onprogress = function (event) {
            if (event.lengthComputable) {
                const uploadPercent = Math.min(88, (event.loaded / event.total) * 88);
                if (event.loaded >= event.total) {
                    progressAnimator.moveTo(91, 'Processing image');
                } else {
                    progressAnimator.moveTo(uploadPercent, attempt > 1 ? `Uploading retry ${attempt}` : 'Uploading');
                }
            }
        };

        xhr.onload = function () {
            if (xhr.status === 200) {
                let data = null;
                try {
                    data = JSON.parse(xhr.responseText);
                } catch (error) {
                    progressAnimator.stop();
                    reportUploadFailure('The upload server response could not be read.', file.name, statusText);
                    if (onComplete) onComplete(false);
                    return;
                }

                if (!data.secure_url) {
                    progressAnimator.stop();
                    reportUploadFailure('Upload completed, but the image URL was not received.', file.name, statusText);
                    if (onComplete) onComplete(false);
                    return;
                }

                const imgObj = {
                    url: data.secure_url,
                    tag: tag,
                    name: file.name,
                    timestamp: Date.now()
                };
                if (password) {
                    imgObj.password = password;
                }

                progressAnimator.moveTo(92, 'Processing image');
                uploadingImageUrls.add(data.secure_url);

                push(imagesRef, imgObj)
                    .then(async (newImageRef) => {
                        const imageKey = newImageRef.key;
                        if (imageKey) uploadingImageKeys.add(imageKey);
                        progressAnimator.moveTo(96, 'Adding to gallery');
                        document.getElementById('fileUpload').value = '';
                        document.getElementById('tagInput').value = '';
                        const didRender = await waitForGalleryImageRendered({ imageUrl: data.secure_url, imageKey });
                        uploadingImageUrls.delete(data.secure_url);
                        if (imageKey) uploadingImageKeys.delete(imageKey);
                        if (didRender) {
                            progressAnimator.finish('Complete');
                        } else {
                            progressAnimator.moveTo(99, 'Preview loading');
                        }
                        statusText.textContent = didRender ? 'Complete' : 'Uploaded, preview loading';
                        const modalStatus = document.getElementById('modalStatus');
                        if (modalStatus) modalStatus.textContent = statusText.textContent;
                        if (onComplete) onComplete(true);
                    })
                    .catch((error) => {
                        progressAnimator.stop();
                        uploadingImageUrls.delete(data.secure_url);
                        console.error("Firebase Push Error:", error);
                        reportUploadFailure(error?.message || 'The image could not be saved to the database.', file.name, statusText);
                        if (onComplete) onComplete(false);
                    });
                return;
            }

            console.error("Cloudinary Upload Failed:", xhr.status, xhr.responseText);
            if (shouldRetryStatus(xhr.status) && retryUpload(attempt, xhr.status)) return;

            progressAnimator.stop();
            reportUploadFailure(getCloudinaryErrorMessage(xhr), file.name, statusText);
            if (onComplete) onComplete(false);
        };

        xhr.onerror = function () {
            console.error("Upload error occurred:", xhr.status);
            if (retryUpload(attempt, 'network error')) return;
            progressAnimator.stop();
            reportUploadFailure('Network issue tha. Auto retry ke baad bhi upload nahi hua. Please try again.', file.name, statusText);
            if (onComplete) onComplete(false);
        };

        xhr.ontimeout = function () {
            if (retryUpload(attempt, 'timeout')) return;
            progressAnimator.stop();
            reportUploadFailure('Upload timed out. Auto retry ke baad bhi complete nahi hua.', file.name, statusText);
            if (onComplete) onComplete(false);
        };

        xhr.onabort = function () {
            progressAnimator.stop();
            reportUploadFailure('The upload was cancelled or the browser aborted the request.', file.name, statusText);
            if (onComplete) onComplete(false);
        };

        try {
            xhr.open('POST', url, true);
            xhr.send(formData);
        } catch (error) {
            if (retryUpload(attempt, error?.message)) return;
            progressAnimator.stop();
            reportUploadFailure(error?.message || 'The browser or system did not allow the photo upload to start.', file.name, statusText);
            if (onComplete) onComplete(false);
        }
    }

    startUploadAttempt(1);
}

// Custom message box function (instead of alert)
function showMessage(message, type = "info") {
    const messageBox = document.createElement("div");
    messageBox.style.position = "fixed";
    messageBox.style.top = "20px";
    messageBox.style.left = "50%";
    messageBox.style.transform = "translateX(-50%)";
    messageBox.style.padding = "15px 25px";
    messageBox.style.borderRadius = "10px";
    messageBox.style.zIndex = "9999";
    messageBox.style.color = "white";
    messageBox.style.fontWeight = "bold";
    messageBox.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
    messageBox.style.transition = "opacity 0.5s ease-in-out";
    messageBox.style.opacity = "1";

    if (type === "error") {
        messageBox.style.backgroundColor = "#f44336"; /* Red */
    } else {
        messageBox.style.backgroundColor = "#4CAF50"; /* Green */
    }

    messageBox.textContent = message;
    document.body.appendChild(messageBox);

    setTimeout(() => {
        messageBox.style.opacity = "0";
        messageBox.addEventListener("transitionend", () => messageBox.remove());
    }, 3000);
}

// Function to handle direct image download
window.downloadImageDirectly = async function (imageUrl, fileName) {
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        showMessage('Download initiated!', 'info');
    } catch (error) {
        console.error("Error downloading image:", error);
        showMessage('Failed to download image.', 'error');
    }
};


function loadImages() {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '';

    // Clear the gallery first to avoid duplicates when data updates
    // The onValue listener will handle re-rendering on changes
    onValue(imagesRef, (snapshot) => {
        gallery.innerHTML = ''; // Clear content every time data changes
        const images = snapshot.val();
        const now = Date.now();

        if (images) {
            const sortedImages = Object.entries(images)
                .map(([key, img]) => ({ key, ...img }))
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Sort by timestamp descending

            sortedImages.forEach(({ key, url, tag, timestamp, name, password: imgPassword }) => {
                // Check if the image is older than 5 minutes (300,000 milliseconds)
                // If it is, delete it from the database (cleanup logic)
                if (now - (timestamp || 0) > 300000) {
                    remove(dbRef(db, `images/${key}`))
                        .then(() => console.log(`Image ${key} deleted (older than 5 min)`))
                        .catch((error) => console.error("Auto-delete error:", error));
                } else {
                    const isLocked = !!imgPassword;
                    const container = document.createElement('div');
                    container.className = 'image-container' + (isLocked ? ' image-locked' : '');
                    container.dataset.imageKey = key;

                    const imgElement = document.createElement('img');
                    imgElement.src = url;
                    imgElement.alt = tag || 'Uploaded image';
                    imgElement.loading = uploadingImageUrls.has(url) || uploadingImageKeys.has(key) ? 'eager' : 'lazy';
                    imgElement.decoding = 'async';
                    imgElement.onerror = () => {
                        imgElement.src = `https://placehold.co/150x150/cccccc/333333?text=Image+Error`;
                        console.warn(`Failed to load image: ${url}`);
                    };

                    // Lock overlay for password protected images
                    if (isLocked) {
                        const lockOverlay = document.createElement('div');
                        lockOverlay.className = 'lock-overlay';
                        lockOverlay.innerHTML = '<span class="lock-icon">🔒</span><span class="lock-text">Tap to unlock</span>';
                        container.appendChild(lockOverlay);
                    }

                    const tagElement = document.createElement('p');
                    tagElement.className = 'tag';
                    tagElement.textContent = `Tag: ${tag || 'No tag'}` + (isLocked ? ' 🔒' : '');

                    // ✅ Shared unlock function — kahi se bhi call karo
                    const unlockImage = () => {
                        if (!container.classList.contains('image-locked')) return; // Already unlocked
                        const enteredPw = prompt('🔑 Enter password to unlock this image:');
                        if (enteredPw === null) return; // Cancelled
                        if (enteredPw === imgPassword) {
                            container.classList.remove('image-locked');
                            container.classList.add('image-unlocked');
                            container.style.cursor = 'default';
                            const overlay = container.querySelector('.lock-overlay');
                            if (overlay) overlay.remove();
                            tagElement.textContent = `Tag: ${tag || 'No tag'} ✅`;
                            const unlockBtnEl = container.querySelector('.unlock-btn');
                            if (unlockBtnEl) unlockBtnEl.style.display = 'none';
                            showMessage('🔓 Image unlocked!', 'info');
                        } else {
                            showMessage('❌ Wrong password!', 'error');
                        }
                    };

                    // ✅ Poore container par click se unlock (locked images ke liye)
                    if (isLocked) {
                        container.style.cursor = 'pointer';
                        container.onclick = (e) => {
                            // Agar button par click kiya hai to ignore karo (button apna kaam karega)
                            if (e.target.closest('.download-btn') || e.target.closest('.delete-btn') || e.target.closest('.unlock-btn')) {
                                return;
                            }
                            unlockImage();
                        };
                    }

                    // Download Button
                    const downloadBtn = document.createElement('button');
                    downloadBtn.className = 'download-btn';
                    downloadBtn.textContent = '⬇ Download';
                    downloadBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (isLocked && container.classList.contains('image-locked')) {
                            unlockImage();
                            return;
                        }
                        window.downloadImageDirectly(url, name || `image_${key}.jpg`);
                    };

                    // Delete Button
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'delete-btn';
                    deleteBtn.textContent = '🗑 Delete';
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        // Agar password protected hai to pehle password maango
                        if (isLocked && imgPassword) {
                            const pw = prompt('🔑 Enter password to delete this image:');
                            if (pw === null) return;
                            if (pw !== imgPassword) {
                                showMessage('❌ Wrong password! Cannot delete.', 'error');
                                return;
                            }
                        }
                        if (confirm('Are you sure you want to delete this image?')) {
                            remove(dbRef(db, `images/${key}`))
                                .then(() => {
                                    showMessage('Image deleted successfully!', 'info');
                                })
                                .catch((error) => {
                                    console.error("Delete error:", error);
                                    showMessage('Failed to delete image.', 'error');
                                });
                        }
                    };

                    // Button group
                    const btnGroup = document.createElement('div');
                    btnGroup.className = 'gallery-btn-group';

                    // Unlock button (only for locked images)
                    if (isLocked) {
                        const unlockBtn = document.createElement('button');
                        unlockBtn.className = 'unlock-btn';
                        unlockBtn.textContent = '🔓 Unlock';
                        unlockBtn.onclick = (e) => {
                            e.stopPropagation();
                            unlockImage();
                        };
                        btnGroup.appendChild(unlockBtn);
                    }

                    btnGroup.appendChild(downloadBtn);
                    btnGroup.appendChild(deleteBtn);

                    container.appendChild(imgElement);
                    container.appendChild(tagElement);
                    container.appendChild(btnGroup);
                    gallery.appendChild(container);
                }
            });
        } else {
            gallery.innerHTML = '<p style="color: #455a64; margin-top: 20px;">No images uploaded yet.</p>';
        }
    });
}

// #endregion

// #region 🔒 CSAT CALCULATOR
// CSAT Calculator Functions
window.openCSATModal = function () {
    document.getElementById('csatModal').style.display = 'flex';
    hideAllMainContent();
    // Ensure all other full-page views are hidden
    const endorsementPage = document.getElementById('endorsementPage');
    if (endorsementPage) endorsementPage.style.display = 'none';
    const manualVIPage = document.getElementById('manualVIPage');
    if (manualVIPage) manualVIPage.style.display = 'none';
    const claimCountNSTPPage = document.getElementById('claimCountNSTPPage');
    if (claimCountNSTPPage) claimCountNSTPPage.style.display = 'none';
    const inspectionWaiverPage = document.getElementById('inspectionWaiverPage');
    if (inspectionWaiverPage) inspectionWaiverPage.style.display = 'none';
    const rsaContactPage = document.getElementById('rsaContactPage');
    if (rsaContactPage) rsaContactPage.style.display = 'none';
    const insurerWisePlanPage = document.getElementById('insurerWisePlanPage');
    if (insurerWisePlanPage) insurerWisePlanPage.style.display = 'none';
    calculateCSAT();
};

window.closeCSATModal = function () {
    document.getElementById('csatModal').style.display = 'none';
    document.getElementById('goodCount').value = '0';
    document.getElementById('badCount').value = '0';
    document.getElementById('requiredCSAT').value = '70';
    document.getElementById('calculateButton').textContent = 'Calculate';
    hasCalculated = false;
    calculateCSAT();
    showAllMainContent();
};

window.calculateCSAT = function () {
    const goodCount = parseInt(document.getElementById('goodCount').value) || 0;
    const badCount = parseInt(document.getElementById('badCount').value) || 0;
    const requiredCSAT = parseInt(document.getElementById('requiredCSAT').value);
    const resultSection = document.getElementById('csatResult');
    const status = document.getElementById('csatStatus');
    const calculateButton = document.getElementById('calculateButton');

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

    let additionalGoodNeeded = 0;
    let newCSAT = csat;
    let newGoodCount = goodCount;
    let newTotal = total;

    if (csat <= requiredCSAT) {
        while (newCSAT <= requiredCSAT) {
            additionalGoodNeeded++;
            newGoodCount = goodCount + additionalGoodNeeded;
            newTotal = total + additionalGoodNeeded;
            newCSAT = (newGoodCount / newTotal) * 100;
        }
    }

    const exactCSAT = newCSAT;

    const isAboveRequired = csat > requiredCSAT;

    if (isAboveRequired) {
        status.textContent = `Success! CSAT (${formattedCSAT}%) is above required (${requiredCSAT}%+).`;
        status.className = 'success';
    } else {
        status.textContent = `Need ${additionalGoodNeeded} more good count(s) to achieve ${requiredCSAT}%+ (exact: ${exactCSAT.toFixed(2)}%).`;
        status.className = 'error';
    }

    if (!hasCalculated) {
        hasCalculated = true;
        calculateButton.textContent = 'Recalculate';
    }
};

// Close CSAT Modal on Outside Click
document.getElementById('csatModal').addEventListener('click', function (event) {
    if (event.target === this) {
        closeCSATModal();
    }
});

// #endregion

// #region 🔒 ENDORSEMENT PAGE
// ENDORSEMENT Full-Page Functionality
window.openEndorsementPage = function () {
    const endorsementPage = document.getElementById('endorsementPage');
    endorsementPage.style.display = 'block';
    endorsementPage.scrollTop = 0;
    setTimeout(() => {
        const endorsementContainer = document.querySelector('.endorsement-container');
        if (endorsementContainer) endorsementContainer.classList.add('active');
    }, 10);
    hideAllMainContent();
    // Ensure all other full-page views are hidden
    const csatModal = document.getElementById('csatModal');
    if (csatModal) csatModal.style.display = 'none';
    const manualVIPage = document.getElementById('manualVIPage');
    if (manualVIPage) manualVIPage.style.display = 'none';
    const claimCountNSTPPage = document.getElementById('claimCountNSTPPage');
    if (claimCountNSTPPage) claimCountNSTPPage.style.display = 'none';
    const inspectionWaiverPage = document.getElementById('inspectionWaiverPage');
    if (inspectionWaiverPage) inspectionWaiverPage.style.display = 'none';
    const rsaContactPage = document.getElementById('rsaContactPage');
    if (rsaContactPage) rsaContactPage.style.display = 'none';
    const insurerWisePlanPage = document.getElementById('insurerWisePlanPage');
    if (insurerWisePlanPage) insurerWisePlanPage.style.display = 'none';
};

window.closeEndorsementPage = function () {
    const endorsementPage = document.getElementById('endorsementPage');
    if (endorsementPage) endorsementPage.style.display = 'none';
    const endorsementContainer = document.querySelector('.endorsement-container');
    if (endorsementContainer) endorsementContainer.classList.remove('active');
    showAllMainContent();
};

// Close ENDORSEMENT Page on Outside Click
document.getElementById('endorsementPage').addEventListener('click', function (event) {
    if (event.target === this) {
        closeEndorsementPage();
    }
});

// #endregion

// #region 🔒 MANUAL-VI & CLAIM COVERAGE
// MANUAL-VI Full-Page Functionality
window.openManualVIPage = function () {
    document.getElementById('manualVIPage').style.display = 'block';
    // Ensure the manual VI card content is visible by default when opening this page
    const manualVICardContent = document.getElementById('manualVICardContent');
    if (manualVICardContent) manualVICardContent.style.display = 'block';
    const claimCoverageOverlay = document.getElementById('claimCoverageOverlay');
    if (claimCoverageOverlay) claimCoverageOverlay.style.display = 'none'; // Hide overlay initially
    const manualVIPage = document.getElementById('manualVIPage');
    if (manualVIPage) manualVIPage.classList.remove('claim-coverage-active'); // Remove class if present
    hideAllMainContent();
    // Ensure all other full-page views are hidden
    const csatModal = document.getElementById('csatModal');
    if (csatModal) csatModal.style.display = 'none';
    const endorsementPage = document.getElementById('endorsementPage');
    if (endorsementPage) endorsementPage.style.display = 'none';
    const claimCountNSTPPage = document.getElementById('claimCountNSTPPage');
    if (claimCountNSTPPage) claimCountNSTPPage.style.display = 'none';
    const inspectionWaiverPage = document.getElementById('inspectionWaiverPage');
    if (inspectionWaiverPage) inspectionWaiverPage.style.display = 'none';
    const rsaContactPage = document.getElementById('rsaContactPage');
    if (rsaContactPage) rsaContactPage.style.display = 'none';
    const insurerWisePlanPage = document.getElementById('insurerWisePlanPage');
    if (insurerWisePlanPage) insurerWisePlanPage.style.display = 'none';
};

window.closeManualVIPage = function () {
    const manualVIPage = document.getElementById('manualVIPage');
    if (manualVIPage) manualVIPage.style.display = 'none';
    showAllMainContent();
    // Also hide the claim coverage overlay when going back to home
    const claimCoverageOverlay = document.getElementById('claimCoverageOverlay');
    if (claimCoverageOverlay) claimCoverageOverlay.style.display = 'none';
    const manualVIPageClassList = document.getElementById('manualVIPage');
    if (manualVIPageClassList) manualVIPageClassList.classList.remove('claim-coverage-active');
};

// Toggle Claim Coverage Overlay within Manual VI Page
window.toggleClaimCoverage = function () {
    const manualVICardContent = document.getElementById('manualVICardContent');
    const claimCoverageOverlay = document.getElementById('claimCoverageOverlay');
    const manualVIPage = document.getElementById('manualVIPage');

    if (claimCoverageOverlay && manualVICardContent && manualVIPage) {
        if (claimCoverageOverlay.style.display === 'flex') {
            // If overlay is visible, hide it and show main card content
            claimCoverageOverlay.style.display = 'none';
            manualVICardContent.style.display = 'block';
            manualVIPage.classList.remove('claim-coverage-active'); // Remove class
        } else {
            // If overlay is hidden, show it and hide main card content
            claimCoverageOverlay.style.display = 'flex';
            manualVICardContent.style.display = 'none';
            manualVIPage.classList.add('claim-coverage-active'); // Add class for styling
        }
    }
};

// Close Manual VI Page OR Claim Coverage Overlay on Outside Click
document.getElementById('manualVIPage').addEventListener('click', function (event) {
    // If the click is directly on the manual-vi-page (background),
    // regardless of which sub-section is open, close the entire page.
    if (event.target === this) {
        closeManualVIPage();
    }
});

// New: Add click listener to the claimCoverageOverlay to close the entire manualVIPage
document.getElementById('claimCoverageOverlay').addEventListener('click', function (event) {
    if (event.target === this) { // Only if the click is directly on the overlay's background
        closeManualVIPage(); // Go back to the main page
    }
});


// #endregion

// #region 🔒 CLAIM COUNT & NSTP
// New Claim_Count & NSTP Page Functionality
window.openClaimCountNSTPPage = function () {
    document.getElementById('claimCountNSTPPage').style.display = 'block';
    hideAllMainContent();
    // Ensure all other full-page views are hidden
    const csatModal = document.getElementById('csatModal');
    if (csatModal) csatModal.style.display = 'none';
    const endorsementPage = document.getElementById('endorsementPage');
    if (endorsementPage) endorsementPage.style.display = 'none';
    const manualVIPage = document.getElementById('manualVIPage');
    if (manualVIPage) manualVIPage.style.display = 'none';
    const inspectionWaiverPage = document.getElementById('inspectionWaiverPage');
    if (inspectionWaiverPage) inspectionWaiverPage.style.display = 'none';
    const rsaContactPage = document.getElementById('rsaContactPage');
    if (rsaContactPage) rsaContactPage.style.display = 'none';
    const insurerWisePlanPage = document.getElementById('insurerWisePlanPage');
    if (insurerWisePlanPage) insurerWisePlanPage.style.display = 'none';
    // Populate the table when the page is opened
    populateTable(insuranceData);
    // Re-apply sort/search listeners as content is dynamic
    setupInsuranceDashboardListeners();
};

window.closeClaimCountNSTPPage = function () {
    const claimCountNSTPPage = document.getElementById('claimCountNSTPPage');
    if (claimCountNSTPPage) claimCountNSTPPage.style.display = 'none';
    showAllMainContent();
};

// Close Claim_Count & NSTP Page on Outside Click
document.getElementById('claimCountNSTPPage').addEventListener('click', function (event) {
    if (event.target === this) {
        // Only close if the click is directly on the overlay, not on the content
        if (event.target.classList.contains('claim-count-nstp-page')) {
            closeClaimCountNSTPPage();
        }
    }
});

// #endregion

// #region 🔒 INSPECTION WAIVER PAGE
// New Inspection Waiver Page Functionality
window.openInspectionWaiverPage = function () {
    document.getElementById('inspectionWaiverPage').style.display = 'block';
    hideAllMainContent();
    // Ensure all other full-page views are hidden
    const csatModal = document.getElementById('csatModal');
    if (csatModal) csatModal.style.display = 'none';
    const endorsementPage = document.getElementById('endorsementPage');
    if (endorsementPage) endorsementPage.style.display = 'none';
    const manualVIPage = document.getElementById('manualVIPage');
    if (manualVIPage) manualVIPage.style.display = 'none';
    const claimCountNSTPPage = document.getElementById('claimCountNSTPPage');
    if (claimCountNSTPPage) claimCountNSTPPage.style.display = 'none';
    const rsaContactPage = document.getElementById('rsaContactPage');
    if (rsaContactPage) rsaContactPage.style.display = 'none';
    const insurerWisePlanPage = document.getElementById('insurerWisePlanPage');
    if (insurerWisePlanPage) insurerWisePlanPage.style.display = 'none';
    // Add a small delay to ensure the page is fully rendered before populating
    setTimeout(() => {
        populateInspectionWaiverTable(inspectionWaiverData);
        console.log("Inspection Waiver table populated with data:", inspectionWaiverData); // Debugging log
    }, 0);
};

window.closeInspectionWaiverPage = function () {
    const inspectionWaiverPage = document.getElementById('inspectionWaiverPage');
    if (inspectionWaiverPage) inspectionWaiverPage.style.display = 'none';
    showAllMainContent();
};

// Close Inspection Waiver Page on Outside Click
document.getElementById('inspectionWaiverPage').addEventListener('click', function (event) {
    if (event.target === this) {
        closeInspectionWaiverPage();
    }
});

// #endregion

// #region 🔒 RSA & CONTACT PAGE
// New RSA & Contact Page Functionality
window.openRSAPage = function () {
    document.getElementById('rsaContactPage').style.display = 'block';
    hideAllMainContent();
    // Ensure all other full-page views are hidden
    const csatModal = document.getElementById('csatModal');
    if (csatModal) csatModal.style.display = 'none';
    const endorsementPage = document.getElementById('endorsementPage');
    if (endorsementPage) endorsementPage.style.display = 'none';
    const manualVIPage = document.getElementById('manualVIPage');
    if (manualVIPage) manualVIPage.style.display = 'none';
    const claimCountNSTPPage = document.getElementById('claimCountNSTPPage');
    if (claimCountNSTPPage) claimCountNSTPPage.style.display = 'none';
    const inspectionWaiverPage = document.getElementById('inspectionWaiverPage');
    if (inspectionWaiverPage) inspectionWaiverPage.style.display = 'none';
    const insurerWisePlanPage = document.getElementById('insurerWisePlanPage');
    if (insurerWisePlanPage) insurerWisePlanPage.style.display = 'none';
    // Add a small delay to ensure the page is fully rendered before populating
    setTimeout(() => {
        populateRSATable(rsaContactData);
        console.log("RSA & Contact table populated with data:", rsaContactData); // Debugging log
    }, 0);
    setupRSADashboardListeners();
};

window.closeRSAPage = function () {
    const rsaContactPage = document.getElementById('rsaContactPage');
    if (rsaContactPage) rsaContactPage.style.display = 'none';
    showAllMainContent();
};

// Close RSA & Contact Page on Outside Click
document.getElementById('rsaContactPage').addEventListener('click', function (event) {
    if (event.target === this) {
        closeRSAPage();
    }
});

// #endregion

// #region 🔒 INSURER WISE PLAN PAGE
// ============================================================
//  INSURER WISE PLAN  –  Full Knowledge-Base Data + UI Logic
// ============================================================

const INSURER_PLAN_DATA = [
    {
        id: 'payd',
        planName: 'Pay As You Drive (PAYD)',
        planType: 'Usage Based',
        icon: '🛣️',
        iconBg: 'linear-gradient(135deg,#06b6d4,#0891b2)',
        description: 'Usage-based insurance for low annual vehicle usage. OD coverage linked to KM slab, lower premium for low-running vehicles. TP & Total Loss cover remain active till expiry.',
        keyFeatures: [
            'OD coverage linked to selected KM slab',
            'Lower premium for low-running vehicles',
            'TP cover active till policy expiry',
            'Total Loss cover active till policy expiry',
            'KM restriction applies to OD coverage only'
        ],
        insurers: [
            {
                name: 'Reliance',
                fresh: ['KYC Required', 'Odometer Inspection Required'],
                renewal: ['No Documents', 'No Inspection', 'STP Issuance'],
                breakIn: ['5 Days Waiver Available'],
                withinWaiver: ['Odometer Upload'],
                afterWaiver: ['KYC', 'Inspection', 'RC', 'Previous Policy', 'Bundle Policy (SAOD)']
            },
            {
                name: 'USGI',
                fresh: ['KYC', 'Odometer Inspection'],
                renewal: ['KYC', 'Odometer Inspection'],
                breakIn: ['KYC', 'Inspection', 'RC', 'Previous Policy', 'Bundle Policy']
            },
            {
                name: 'Bajaj',
                fresh: ['KYC', 'Odometer Reading Entry'],
                renewal: ['KYC', 'Odometer Reading Entry'],
                breakIn: ['KYC', 'Inspection', 'RC', 'Previous Policy', 'Bundle Policy']
            },
            {
                name: 'Zuno',
                fresh: ['KYC', 'Odometer Inspection'],
                renewal: ['KYC', 'Odometer Inspection'],
                breakIn: ['2 Days Waiver Available'],
                afterWaiver: ['KYC', 'Inspection', 'RC', 'Previous Policy', 'Bundle Policy']
            },
            {
                name: 'ICICI',
                fresh: ['KYC', 'Odometer Entry'],
                renewal: ['KYC', 'Odometer Entry'],
                breakIn: ['KYC', 'Inspection', 'RC', 'Previous Policy', 'Bundle Policy']
            },
            {
                name: 'Digit',
                fresh: ['KYC', 'Odometer Entry'],
                renewal: ['KYC', 'Odometer Entry'],
                inspectionRules: [
                    'No Inspection if NCB selected & KM slab below 10,000',
                    'Inspection Required if NCB 20%+ & KM slab 10,000+'
                ],
                breakIn: ['KYC', 'Inspection', 'RC', 'Previous Policy', 'Bundle Policy']
            },
            {
                name: 'Shriram',
                fresh: ['KYC', 'Odometer Inspection'],
                renewal: ['KYC', 'Odometer Inspection'],
                breakIn: ['KYC', 'Inspection', 'RC', 'Previous Policy', 'Bundle Policy']
            },
            {
                name: 'Cholamandalam',
                fresh: ['KYC', 'Odometer Inspection'],
                renewal: ['KYC', 'Odometer Inspection'],
                breakIn: ['KYC', 'Inspection', 'RC', 'Previous Policy', 'Bundle Policy']
            }
        ]
    },
    {
        id: 'good-driver',
        planName: 'Good Driver Plan',
        planType: 'Discount Plan',
        icon: '🏆',
        iconBg: 'linear-gradient(135deg,#f59e0b,#d97706)',
        description: 'Same coverage as Comprehensive / SAOD with unlimited KM usage after issuance. Eligibility based on average yearly running.',
        keyFeatures: [
            'Same coverage as Comprehensive Policy / SAOD',
            'Unlimited KM usage after issuance',
            'Eligibility: Below 8K / 10K / 12K / 15K KM annually',
            'QC Team verifies average yearly running'
        ],
        insurers: [
            {
                name: 'Tata AIG',
                fresh: ['KYC', 'Odometer Inspection', 'QC Verification'],
                renewal: ['KYC', 'Odometer Inspection', 'QC Verification'],
                breakIn: ['KYC', 'Inspection', 'RC', 'Previous Policy', 'Bundle Policy', 'QC Approval']
            },
            {
                name: 'Digit',
                fresh: ['KYC', 'Odometer Inspection', 'QC Verification'],
                renewal: ['KYC', 'Odometer Inspection', 'QC Verification'],
                breakIn: ['KYC', 'Inspection', 'RC', 'Previous Policy', 'Bundle Policy', 'QC Approval']
            }
        ]
    },
    {
        id: 'switch-on-off',
        planName: 'Motor Switch ON / OFF',
        planType: 'Flexible Plan',
        icon: '🔘',
        iconBg: 'linear-gradient(135deg,#8b5cf6,#7c3aed)',
        description: 'Switch OD cover ON/OFF anytime. Every continuous 24-hour OFF period earns 1 Bonus Day. Theft & other coverages remain active.',
        keyFeatures: [
            'Meter Cover Add-on Mandatory',
            'OD Cover can be switched OFF / ON anytime',
            'Every 24-hour OFF = 1 Bonus Day',
            'Theft Cover remains active',
            'Other applicable coverages remain active'
        ],
        insurers: [
            {
                name: 'Kotak',
                fresh: ['Meter Cover Add-on Mandatory'],
                renewal: ['Meter Cover Add-on Mandatory'],
                breakIn: ['Standard Break-In process']
            }
        ]
    },
    {
        id: 'special-inspection-discount',
        planName: 'Special Inspection Discount Plan',
        planType: 'Discount Plan',
        icon: '🔍',
        iconBg: 'linear-gradient(135deg,#10b981,#059669)',
        description: 'Discounted premium with same coverage as Comprehensive / SAOD. Requires active existing policy and short odometer inspection upload.',
        keyFeatures: [
            'Discounted Premium',
            'Same Coverage as Comprehensive / SAOD',
            'Existing policy must be active',
            'Short Odometer Inspection Upload required'
        ],
        insurers: [
            { name: 'Bajaj', fresh: ['Short Odometer Inspection Upload'], renewal: ['Short Odometer Inspection Upload'], breakIn: ['Not Applicable \u2013 Active policy required'] },
            { name: 'Cholamandalam', fresh: ['Short Odometer Inspection Upload'], renewal: ['Short Odometer Inspection Upload'], breakIn: ['Not Applicable \u2013 Active policy required'] },
            { name: 'ICICI', fresh: ['Short Odometer Inspection Upload'], renewal: ['Short Odometer Inspection Upload'], breakIn: ['Not Applicable \u2013 Active policy required'] },
            { name: 'Kotak', fresh: ['Short Odometer Inspection Upload'], renewal: ['Short Odometer Inspection Upload'], breakIn: ['Not Applicable \u2013 Active policy required'] },
            { name: 'Magma', fresh: ['Short Odometer Inspection Upload'], renewal: ['Short Odometer Inspection Upload'], breakIn: ['Not Applicable \u2013 Active policy required'] },
            { name: 'National', fresh: ['Short Odometer Inspection Upload'], renewal: ['Short Odometer Inspection Upload'], breakIn: ['Not Applicable \u2013 Active policy required'] }
        ]
    },
    {
        id: 'long-term-new',
        planName: 'Long Term Plan (New Vehicle)',
        planType: 'Long Term',
        icon: '🆕',
        iconBg: 'linear-gradient(135deg,#3b82f6,#2563eb)',
        description: '3+3 plan for new vehicles \u2014 3 Year Third Party + 3 Year Own Damage. No yearly renewal hassle.',
        keyFeatures: [
            '3 Year Third Party coverage',
            '3 Year Own Damage coverage',
            'No yearly renewal hassle',
            'Long-term protection'
        ],
        insurers: [
            { name: 'Tata AIG', fresh: ['Standard New Vehicle Documentation'], renewal: ['N/A \u2013 3 Year Plan'], breakIn: ['N/A'] },
            { name: 'Digit', fresh: ['Standard New Vehicle Documentation'], renewal: ['N/A \u2013 3 Year Plan'], breakIn: ['N/A'] },
            { name: 'ICICI', fresh: ['Standard New Vehicle Documentation'], renewal: ['N/A \u2013 3 Year Plan'], breakIn: ['N/A'] },
            { name: 'NIA', fresh: ['Standard New Vehicle Documentation'], renewal: ['N/A \u2013 3 Year Plan'], breakIn: ['N/A'] }
        ]
    },
    {
        id: 'long-term-old',
        planName: 'Long Term Plan (Old Vehicle)',
        planType: 'Long Term',
        icon: '🔄',
        iconBg: 'linear-gradient(135deg,#6366f1,#4f46e5)',
        description: '3+3 plan for old vehicles \u2014 3 Year Third Party + 3 Year Own Damage. Long-term protection without annual renewal.',
        keyFeatures: [
            '3 Year Third Party coverage',
            '3 Year Own Damage coverage',
            'Long-term protection',
            'No annual renewal'
        ],
        insurers: [
            { name: 'Tata AIG', fresh: ['Standard Documentation'], renewal: ['N/A \u2013 3 Year Plan'], breakIn: ['N/A'] },
            { name: 'Digit', fresh: ['Standard Documentation'], renewal: ['N/A \u2013 3 Year Plan'], breakIn: ['N/A'] },
            { name: 'ICICI', fresh: ['Standard Documentation'], renewal: ['N/A \u2013 3 Year Plan'], breakIn: ['N/A'] }
        ]
    },
    {
        id: 'network-garage',
        planName: 'Network Preferred Garage Plan',
        planType: 'Network Plan',
        icon: '🏪',
        iconBg: 'linear-gradient(135deg,#ec4899,#db2777)',
        description: 'Premium discount with comprehensive coverage. Co-pay applicable for non-network garage claims.',
        keyFeatures: [
            'Premium Discount',
            'Same Comprehensive Coverage',
            'Add-ons Available',
            'Co-pay for Non-Network Garage claims'
        ],
        insurers: [
            { name: 'Kotak', fresh: ['Standard Documentation'], renewal: ['Standard Documentation'], breakIn: ['Standard Break-In'], nonNetworkCopay: '\u20B95000 Co-pay', networkGarage: 'Nil', planIdentifier: 'Voluntary Deductible Protect' },
            { name: 'Cholamandalam', fresh: ['Standard Documentation'], renewal: ['Standard Documentation'], breakIn: ['Standard Break-In'], nonNetworkCopay: '\u20B95000 Co-pay', planIdentifier: 'Clause 22A' },
            { name: 'Bajaj', fresh: ['Standard Documentation'], renewal: ['Standard Documentation'], breakIn: ['Standard Break-In'], nonNetworkCopay: '\u20B95000 Co-pay' },
            { name: 'Digit', fresh: ['Standard Documentation'], renewal: ['Standard Documentation'], breakIn: ['Standard Break-In'], nonNetworkCopay: 'As per policy conditions', planIdentifier: 'Voluntary Deductible Protect' },
            { name: 'Reliance', fresh: ['Standard Documentation'], renewal: ['Standard Documentation'], breakIn: ['Standard Break-In'], nonNetworkCopay: '\u20B93000 Co-pay' }
        ]
    },
    {
        id: 'drive-assure',
        planName: 'Drive Assure',
        planType: 'Special Plan',
        icon: '🛡️',
        iconBg: 'linear-gradient(135deg,#ef4444,#dc2626)',
        description: 'Discounted policy with Zero Depreciation for Break-In and Special Plan cases. \u20B91000 Co-pay applicable at all garages.',
        keyFeatures: [
            'For Break-In & Special Plan cases',
            'Discounted Policy',
            'Includes Zero Depreciation',
            '\u20B91000 Co-pay applicable',
            'All garages covered',
            'Comprehensive + Zero Dep coverage'
        ],
        insurers: [
            { name: 'Bajaj', fresh: ['Break-In / Special Plan Cases'], renewal: ['Break-In / Special Plan Cases'], breakIn: ['Eligible for Break-In cases'] }
        ]
    },
    {
        id: 'monthly-mode',
        planName: 'Monthly Mode',
        planType: 'Flexible Plan',
        icon: '📅',
        iconBg: 'linear-gradient(135deg,#14b8a6,#0d9488)',
        description: 'Monthly SAOD with auto renewal every month. Valid till TP Expiry. Payment via Credit Card, Debit Card, or UPI Auto Mandate.',
        keyFeatures: [
            'Monthly SAOD',
            'Auto Renewal Every Month',
            'Valid till TP Expiry',
            'Payment: Credit Card / Debit Card / UPI Auto Mandate',
            'Parent Booking = First Month',
            'Child Booking = Subsequent Renewals'
        ],
        insurers: [
            { name: 'Reliance', fresh: ['Credit Card / Debit Card / UPI Auto Mandate'], renewal: ['Auto Renewal'], breakIn: ['N/A'] },
            { name: 'ICICI', fresh: ['Information Not Available'], renewal: ['Information Not Available'], breakIn: ['Information Not Available'] }
        ]
    },
    {
        id: 'motor-protection',
        planName: 'Motor Protection Cover',
        planType: 'Add-on',
        icon: '⚖️',
        iconBg: 'linear-gradient(135deg,#78716c,#57534e)',
        description: 'Legal Assistance Cover \u2014 Advocate assistance, court proceedings guidance, and accident-related legal support.',
        keyFeatures: [
            'Legal Assistance Cover',
            'Advocate Assistance',
            'Court Proceedings Guidance',
            'Accident-related Legal Support',
            'Helpline: 1800-300-30000 / 1800-103-3009'
        ],
        insurers: [
            { name: 'Shriram', fresh: ['Standard Documentation'], renewal: ['Standard Documentation'], breakIn: ['Standard Break-In'] }
        ]
    },
    {
        id: 'eco-assure',
        planName: 'Eco Assure',
        planType: 'Eco Plan',
        icon: '♻️',
        iconBg: 'linear-gradient(135deg,#22c55e,#16a34a)',
        description: 'Refurbished parts used in partial damage claims. Lower premium, no depreciation on repaired parts, preferred workshop benefits.',
        keyFeatures: [
            'Refurbished Parts in Partial Damage Claims',
            'Lower Premium',
            'No Depreciation on Repaired Parts',
            'No File Charges in Eligible Repairs',
            'Preferred Workshop Benefits',
            'Limit: Up to IDV'
        ],
        insurers: [
            { name: 'Bajaj', fresh: ['Standard Documentation'], renewal: ['Standard Documentation'], breakIn: ['Standard Break-In'] }
        ]
    },
    {
        id: 'super-saver',
        planName: 'Super Saver Plan',
        planType: 'Discount Plan',
        icon: '💰',
        iconBg: 'linear-gradient(135deg,#eab308,#ca8a04)',
        description: 'Comprehensive policy with add-ons and \u20B95000 voluntary deductible. Lower premium. Not directly visible to customer \u2014 advisor must unlock.',
        keyFeatures: [
            'Comprehensive Policy',
            'Add-ons Included',
            '\u20B95000 Voluntary Deductible',
            'Lower Premium',
            'Not visible to customer directly',
            'Advisor must unlock plan'
        ],
        insurers: [
            { name: 'Digit', fresh: ['Advisor Unlock Required'], renewal: ['Advisor Unlock Required'], breakIn: ['Standard Break-In'] }
        ]
    }
];

// ---------- Color palette per insurer ----------
const IWP_INSURER_COLORS = {
    'Reliance': '#06b6d4',
    'USGI': '#f97316',
    'Bajaj': '#3b82f6',
    'Zuno': '#a855f7',
    'ICICI': '#ef4444',
    'Digit': '#22c55e',
    'Shriram': '#eab308',
    'Cholamandalam': '#ec4899',
    'Tata AIG': '#6366f1',
    'Kotak': '#14b8a6',
    'Magma': '#f472b6',
    'National': '#0ea5e9',
    'NIA': '#0ea5e9',
    'default': '#7b2ff7'
};

function getInsurerColor(name) {
    return IWP_INSURER_COLORS[name] || IWP_INSURER_COLORS['default'];
}

// ---------- State ----------
let iwpSelectedPlans = new Set();

// ---------- Open / Close ----------
window.openInsurerWisePlanPage = function () {
    const page = document.getElementById('insurerWisePlanPage');
    page.style.display = 'block';
    page.scrollTop = 0;
    hideAllMainContent();

    // Hide all other full-page views
    const pages = ['csatModal', 'endorsementPage', 'manualVIPage', 'claimCountNSTPPage', 'inspectionWaiverPage', 'rsaContactPage'];
    pages.forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    iwpSelectedPlans.clear();
    iwpPopulateFilters();
    iwpRender();
    iwpSetupListeners();
};

window.closeInsurerWisePlanPage = function () {
    const page = document.getElementById('insurerWisePlanPage');
    if (page) page.style.display = 'none';
    showAllMainContent();
};

// Close on background click
document.getElementById('insurerWisePlanPage').addEventListener('click', function (event) {
    if (event.target === this) {
        closeInsurerWisePlanPage();
    }
});

// ---------- Populate Filters ----------
function iwpPopulateFilters() {
    const insurerSet = new Set();
    const typeSet = new Set();
    INSURER_PLAN_DATA.forEach(function (plan) {
        typeSet.add(plan.planType);
        plan.insurers.forEach(function (ins) { insurerSet.add(ins.name); });
    });

    const insurerFilter = document.getElementById('insurerPlanInsurerFilter');
    const typeFilter = document.getElementById('insurerPlanTypeFilter');

    insurerFilter.innerHTML = '<option value="">All Insurers</option>';
    Array.from(insurerSet).sort().forEach(function (name) {
        insurerFilter.innerHTML += '<option value="' + name + '">' + name + '</option>';
    });

    typeFilter.innerHTML = '<option value="">All Plan Types</option>';
    Array.from(typeSet).sort().forEach(function (type) {
        typeFilter.innerHTML += '<option value="' + type + '">' + type + '</option>';
    });
}

// ---------- Filter Logic ----------
function iwpGetFilteredData() {
    const searchVal = (document.getElementById('insurerPlanSearch').value || '').toLowerCase().trim();
    const insurerVal = document.getElementById('insurerPlanInsurerFilter').value;
    const typeVal = document.getElementById('insurerPlanTypeFilter').value;

    return INSURER_PLAN_DATA.filter(function (plan) {
        if (typeVal && plan.planType !== typeVal) return false;

        if (insurerVal) {
            var hasInsurer = plan.insurers.some(function (ins) { return ins.name === insurerVal; });
            if (!hasInsurer) return false;
        }

        if (searchVal) {
            var haystack = [
                plan.planName,
                plan.planType,
                plan.description
            ].concat(plan.keyFeatures)
                .concat(plan.insurers.map(function (i) { return i.name; }))
                .concat(plan.insurers.reduce(function (acc, i) {
                    return acc.concat(i.fresh || []).concat(i.renewal || []).concat(i.breakIn || []);
                }, []))
                .join(' ').toLowerCase();
            if (haystack.indexOf(searchVal) === -1) return false;
        }

        return true;
    });
}

// ---------- Render Summary ----------
function iwpRenderSummary(filteredData) {
    var summaryEl = document.getElementById('insurerPlanSummary');
    var totalPlans = filteredData.length;
    var insurerNames = {};
    filteredData.forEach(function (p) {
        p.insurers.forEach(function (i) { insurerNames[i.name] = true; });
    });
    var totalInsurers = Object.keys(insurerNames).length;
    var totalEntries = filteredData.reduce(function (sum, p) { return sum + p.insurers.length; }, 0);

    summaryEl.innerHTML =
        '<div class="iwp-stat"><div class="iwp-stat-value">' + totalPlans + '</div><div class="iwp-stat-label">Plans</div></div>' +
        '<div class="iwp-stat"><div class="iwp-stat-value">' + totalInsurers + '</div><div class="iwp-stat-label">Insurers</div></div>' +
        '<div class="iwp-stat"><div class="iwp-stat-value">' + totalEntries + '</div><div class="iwp-stat-label">Entries</div></div>';
}

// ---------- Render Selected Chips ----------
function iwpRenderSelectedChips() {
    var el = document.getElementById('insurerPlanSelected');
    if (iwpSelectedPlans.size === 0) {
        el.innerHTML = '';
        return;
    }
    var html = '';
    iwpSelectedPlans.forEach(function (id) {
        var plan = INSURER_PLAN_DATA.find(function (p) { return p.id === id; });
        var label = plan ? plan.icon + ' ' + plan.planName : id;
        html += '<div class="iwp-sel-chip" onclick="iwpDeselectPlan(\'' + id + '\')">' + label + ' <span class="iwp-chip-x">\u2715</span></div>';
    });
    el.innerHTML = html;
}

window.iwpDeselectPlan = function (id) {
    iwpSelectedPlans.delete(id);
    iwpRenderSelectedChips();
    var card = document.querySelector('.iwp-card[data-plan-id="' + id + '"]');
    if (card) card.classList.remove('iwp-card-selected');
};

// ---------- Build Card HTML ----------
function iwpBuildInsurerSection(insurer) {
    var html = '<div class="iwp-section">' +
        '<div class="iwp-section-title" style="color:' + getInsurerColor(insurer.name) + '; border-bottom: 2px solid ' + getInsurerColor(insurer.name) + '1a; padding-bottom: 2px; margin-bottom: 6px;">' + insurer.name + '</div>';

    var sections = [
        { label: 'Fresh', data: insurer.fresh, color: '#2e7d32', bg: '#e8f5e9' },
        { label: 'Renewal', data: insurer.renewal, color: '#1565c0', bg: '#e3f2fd' },
        { label: 'Inspection Rules', data: insurer.inspectionRules, color: '#37474f', bg: '#eceff1' },
        { label: 'Break-In', data: insurer.breakIn, color: '#e65100', bg: '#fff3e0' },
        { label: 'Within Waiver', data: insurer.withinWaiver, color: '#6a1b9a', bg: '#f3e5f5' },
        { label: 'After Waiver', data: insurer.afterWaiver, color: '#c62828', bg: '#ffebee' }
    ];

    sections.forEach(function (sec) {
        if (sec.data && sec.data.length > 0) {
            html += '<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:' + sec.color + ';background:' + sec.bg + ';margin-top:6px;margin-bottom:3px;">' + sec.label + '</span>';
            html += '<ul class="iwp-section-list">';
            sec.data.forEach(function (item) { html += '<li>' + item + '</li>'; });
            html += '</ul>';
        }
    });

    if (insurer.nonNetworkCopay) {
        html += '<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:#c62828;background:#ffebee;margin-top:6px;margin-bottom:3px;">Non-Network Garage</span>';
        html += '<ul class="iwp-section-list"><li>' + insurer.nonNetworkCopay + '</li></ul>';
    }
    if (insurer.networkGarage) {
        html += '<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:#00796b;background:#e0f2f1;margin-top:6px;margin-bottom:3px;">Network Garage</span>';
        html += '<ul class="iwp-section-list"><li>' + insurer.networkGarage + '</li></ul>';
    }
    if (insurer.planIdentifier) {
        html += '<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:#303f9f;background:#e8eaf6;margin-top:6px;margin-bottom:3px;">Plan Identifier</span>';
        html += '<ul class="iwp-section-list"><li>' + insurer.planIdentifier + '</li></ul>';
    }

    html += '</div>';
    return html;
}

function iwpBuildCard(plan, index) {
    var insurerVal = document.getElementById('insurerPlanInsurerFilter').value;
    var displayInsurers = insurerVal
        ? plan.insurers.filter(function (i) { return i.name === insurerVal; })
        : plan.insurers;

    var insurerNamesList = displayInsurers.map(function (i) { return i.name; });
    var isSelected = iwpSelectedPlans.has(plan.id);

    var html = '<div class="iwp-card' + (isSelected ? ' iwp-card-selected' : '') + '" data-plan-id="' + plan.id + '" style="animation-delay:' + (index * 0.05) + 's">';

    // Card Head
    html += '<div class="iwp-card-head">' +
        '<div class="iwp-card-icon" style="background:' + plan.iconBg + '">' + plan.icon + '</div>' +
        '<div><div class="iwp-card-title">' + plan.planName + '</div>' +
        '<div class="iwp-card-plantype">' + plan.planType + '</div></div></div>';

    // Card Body
    html += '<div class="iwp-card-body">';

    // Insurer Tags
    html += '<div class="iwp-tag-row">';
    insurerNamesList.forEach(function (name) {
        var c = getInsurerColor(name);
        html += '<span class="iwp-tag iwp-tag-insurer" style="color:' + c + ';border-color:' + c + '33;background:' + c + '1a">' + name + '</span>';
    });
    html += '</div>';

    // Description
    html += '<p class="iwp-card-desc">' + plan.description + '</p>';

    // Expandable Details
    html += '<div class="iwp-card-details" id="iwpDetails_' + plan.id + '">';

    // Key Features (Moved inside details)
    html += '<div class="iwp-section" style="margin-top: 10px; margin-bottom: 14px;"><div class="iwp-section-title">Key Features</div><ul class="iwp-section-list">';
    plan.keyFeatures.forEach(function (f) { html += '<li>' + f + '</li>'; });
    html += '</ul></div>';

    displayInsurers.forEach(function (ins) {
        html += iwpBuildInsurerSection(ins);
    });
    html += '</div>';

    html += '</div>'; // end card-body

    // Toggle Button
    html += '<button class="iwp-card-toggle" onclick="iwpToggleCard(\'' + plan.id + '\', event)">' +
        '<span id="iwpToggleText_' + plan.id + '">\u25BC Show Details</span></button>';

    html += '</div>';
    return html;
}

// ---------- Toggle expand ----------
window.iwpToggleCard = function (planId, event) {
    event.stopPropagation();
    var details = document.getElementById('iwpDetails_' + planId);
    var toggleText = document.getElementById('iwpToggleText_' + planId);
    if (details.classList.contains('iwp-open')) {
        details.classList.remove('iwp-open');
        toggleText.textContent = '\u25BC Show Details';
    } else {
        details.classList.add('iwp-open');
        toggleText.textContent = '\u25B2 Hide Details';
    }
};

// ---------- Main Render ----------
function iwpRender() {
    var filtered = iwpGetFilteredData();
    var grid = document.getElementById('insurerPlanGrid');

    iwpRenderSummary(filtered);
    iwpRenderSelectedChips();

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="iwp-no-results"><span>\uD83D\uDD0D</span>No plans found matching your search.</div>';
        return;
    }

    grid.innerHTML = filtered.map(function (plan, i) { return iwpBuildCard(plan, i); }).join('');

    // Attach click-to-select on cards
    grid.querySelectorAll('.iwp-card').forEach(function (card) {
        card.addEventListener('click', function (e) {
            if (e.target.closest('.iwp-card-toggle')) return;
            var id = this.dataset.planId;
            if (iwpSelectedPlans.has(id)) {
                iwpSelectedPlans.delete(id);
                this.classList.remove('iwp-card-selected');
            } else {
                iwpSelectedPlans.add(id);
                this.classList.add('iwp-card-selected');
            }
            iwpRenderSelectedChips();
        });
    });
}

// ---------- Event Listeners ----------
var iwpListenersAttached = false;

function iwpSetupListeners() {
    if (iwpListenersAttached) return;
    iwpListenersAttached = true;

    var searchInput = document.getElementById('insurerPlanSearch');
    var insurerFilter = document.getElementById('insurerPlanInsurerFilter');
    var typeFilter = document.getElementById('insurerPlanTypeFilter');

    var debounceTimer;
    searchInput.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () { iwpRender(); }, 200);
    });

    insurerFilter.addEventListener('change', function () { iwpRender(); });
    typeFilter.addEventListener('change', function () { iwpRender(); });
}

// #endregion

// #region 🔒 VISIBILITY HELPERS
// Helper functions to manage visibility
function hideAllMainContent() {
    const uploadSection = document.querySelector('.upload-section');
    if (uploadSection) uploadSection.style.display = 'none';
    const h3Element = document.querySelector('h3'); /* 'Uploaded Images' header */
    if (h3Element) h3Element.style.display = 'none';
    const gallery = document.getElementById('gallery');
    if (gallery) gallery.style.display = 'none';
    const csatBtn = document.querySelector('.csat-btn');
    if (csatBtn) csatBtn.style.display = 'none';
    const endorsementBtn = document.querySelector('.endorsement-btn');
    if (endorsementBtn) endorsementBtn.style.display = 'none';
    const manualVIBtnFixed = document.querySelector('.manual-vi-btn-fixed');
    if (manualVIBtnFixed) manualVIBtnFixed.style.display = 'none';
    const claimCountNSTPBtnFixed = document.querySelector('.claim-count-nstp-btn-fixed');
    if (claimCountNSTPBtnFixed) claimCountNSTPBtnFixed.style.display = 'none';
    const inspectionWaiverBtnFixed = document.querySelector('.inspection-waiver-btn-fixed');
    if (inspectionWaiverBtnFixed) inspectionWaiverBtnFixed.style.display = 'none';
    const rsaContactBtnFixed = document.querySelector('.rsa-contact-btn-fixed');
    if (rsaContactBtnFixed) rsaContactBtnFixed.style.display = 'none';
    const companyUpdatesButton = document.getElementById('companyUpdatesButton');
    if (companyUpdatesButton) companyUpdatesButton.style.display = 'none';
    const notebookButton = document.getElementById('notebookButton');
    if (notebookButton) notebookButton.style.display = 'none';
}

function showAllMainContent() {
    const uploadSection = document.querySelector('.upload-section');
    if (uploadSection) uploadSection.style.display = 'block';
    const h3Element = document.querySelector('h3'); /* 'Uploaded Images' header */
    if (h3Element) h3Element.style.display = 'block';
    const gallery = document.getElementById('gallery');
    if (gallery) gallery.style.display = 'grid'; /* grid for gallery */

    // Only show fixed buttons if not on mobile (based on media query)
    const isMobile = window.matchMedia("(max-width: 600px)").matches;
    if (!isMobile) {
        const csatBtn = document.querySelector('.csat-btn');
        if (csatBtn) csatBtn.style.display = 'block';
        const endorsementBtn = document.querySelector('.endorsement-btn');
        if (endorsementBtn) endorsementBtn.style.display = 'block';
        const manualVIBtnFixed = document.querySelector('.manual-vi-btn-fixed');
        if (manualVIBtnFixed) manualVIBtnFixed.style.display = 'block';
        const claimCountNSTPBtnFixed = document.querySelector('.claim-count-nstp-btn-fixed');
        if (claimCountNSTPBtnFixed) claimCountNSTPBtnFixed.style.display = 'block';
        const inspectionWaiverBtnFixed = document.querySelector('.inspection-waiver-btn-fixed');
        if (inspectionWaiverBtnFixed) inspectionWaiverBtnFixed.style.display = 'block';
        const rsaContactBtnFixed = document.querySelector('.rsa-contact-btn-fixed');
        if (rsaContactBtnFixed) rsaContactBtnFixed.style.display = 'block';
    }
    // Explicitly control visibility of the new updates button
    const companyUpdatesButton = document.getElementById('companyUpdatesButton');
    if (companyUpdatesButton) companyUpdatesButton.style.display = 'flex';
    const notebookButton = document.getElementById('notebookButton');
    if (notebookButton) notebookButton.style.display = 'flex';
}

// #endregion

// #region 🔒 ENDORSEMENT DATA (JSON)
const insurerDropdown = document.querySelector('.endorsement-page #insurer');
const requirementDropdown = document.querySelector('.endorsement-page #requirement');
const outputBox = document.querySelector('.endorsement-page #output');

// Empty array for you to manually add JSON data for Endorsement
const endorsementData = [
    {
        "InsurerRequirement": "New India AssuranceAddition of GST No.",
        "Insurer": "New India Assurance",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceChassis Number",
        "Insurer": "New India Assurance",
        "Requirement": "Chassis Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceColour Change",
        "Insurer": "New India Assurance",
        "Requirement": "Colour Change",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceEngine Number",
        "Insurer": "New India Assurance",
        "Requirement": "Engine Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceHypothecation Remove",
        "Insurer": "New India Assurance",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC, NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceHypothecation Add",
        "Insurer": "New India Assurance",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Updated RC or Loan sanction letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceHypothecation Change",
        "Insurer": "New India Assurance",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Updated RC or NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceInsured name",
        "Insurer": "New India Assurance",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceNCB Certificate",
        "Insurer": "New India Assurance",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale letter or new vehicle invoice, PYP, NCB Confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": "Kindly request the customer to provide in written on mail or from MyAccount:\r\nKindly confirm whether customer wants to cancel the Own damage part of the policy or want to recover the ncb."
    },
    {
        "InsurerRequirement": "New India AssuranceRegistration Date",
        "Insurer": "New India Assurance",
        "Requirement": "Registration Date",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceRegst. Number",
        "Insurer": "New India Assurance",
        "Requirement": "Regst. Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceRTO Endorsement",
        "Insurer": "New India Assurance",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceSeating Capacity",
        "Insurer": "New India Assurance",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssurancePeriod of Insurance (POI)",
        "Insurer": "New India Assurance",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssurancePYP Details- POI or Insurer or Policy number",
        "Insurer": "New India Assurance",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceTP details",
        "Insurer": "New India Assurance",
        "Requirement": "TP details",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Bundled TP or PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceCommunication Address",
        "Insurer": "New India Assurance",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete address with pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceDate of Birth (DOB)",
        "Insurer": "New India Assurance",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceEmail Address",
        "Insurer": "New India Assurance",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete Email ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceMobile Number",
        "Insurer": "New India Assurance",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceNominee Details",
        "Insurer": "New India Assurance",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceSalutation",
        "Insurer": "New India Assurance",
        "Requirement": "Salutation",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceOwner Driver Personal Accident",
        "Insurer": "New India Assurance",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssurancePaid Driver",
        "Insurer": "New India Assurance",
        "Requirement": "Paid Driver",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceUn Named Passanger Cover",
        "Insurer": "New India Assurance",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceCNG Addition External",
        "Insurer": "New India Assurance",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG Invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceCNG Addition Company fitted",
        "Insurer": "New India Assurance",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceCubic Capacity (CC)",
        "Insurer": "New India Assurance",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "New India Assurance",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceIDV Change",
        "Insurer": "New India Assurance",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceManufactured Date",
        "Insurer": "New India Assurance",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceMake, Model & Variant",
        "Insurer": "New India Assurance",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceOwnership Transfer",
        "Insurer": "New India Assurance",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, New owner details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceNCB Correction (taken extra NCB)",
        "Insurer": "New India Assurance",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceNCB Correction (taken less NCB)",
        "Insurer": "New India Assurance",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceTop Up (PAYD plan)",
        "Insurer": "New India Assurance",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "New India Assurance",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC,KYC,PYP, Proposal Form & Bank statement with payee name",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssurancePost Issuance Cancellation",
        "Insurer": "New India Assurance",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "NA",
        "Documents or any other requirement": "Before Policy period has started:\r\nOnly consent required (Alternate not required)\r\n\r\nAfter Policy period has started:\r\nAlternate Policy with same POI (same date & time) or POI before the start of the policy which is to be cancelled and Reason for cancellation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Incase of any mismatch in details, customer will have to get the endorsement done before cancellation",
        "Declaration format (if declaration required)": "Before Policy period has started:\r\nI/We hereby declare that Policy No. _______ for Vehicle No. _______, covering the period from _______ to _______, was purchased by me/us on _______. Due to ________________, I/we request the cancellation of the above-mentioned Policy No. _______. I/we will not regsitered any claim in future\r\n\r\nAfter Policy period has started:\r\nI/We hereby declare that Policy No. _____________________ for Vehicle No. _____________________, covering the period from _____________________ to _____________________, was purchased by me/us on _____________________. Due to ________________________________________________, I/we request the cancellation of the above-mentioned Policy No. _____________________. I/we further confirm that no claims have been made under this policy or any other policy related to the said vehicle till date. I/we also confirm that an alternate policy, Policy No. _____________________, valid from _____________________, issued by _______________________________, has been provided and is currently active."
    },
    {
        "InsurerRequirement": "New India AssurancePost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "New India Assurance",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "NA",
        "Documents or any other requirement": "Not Possible",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Not Possible",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "New India AssuranceM-Parivahan",
        "Insurer": "New India Assurance",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliAddition of GST No.",
        "Insurer": "Future Generali",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliChassis Number",
        "Insurer": "Future Generali",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliColour Change",
        "Insurer": "Future Generali",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliEngine Number",
        "Insurer": "Future Generali",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliHypothecation Remove",
        "Insurer": "Future Generali",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliHypothecation Add",
        "Insurer": "Future Generali",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or Loan sanction letter,",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliHypothecation Change",
        "Insurer": "Future Generali",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliInsured name",
        "Insurer": "Future Generali",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, PYP, KYC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP\r\nFor Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliNCB Certificate",
        "Insurer": "Future Generali",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale letter, PYP, NCB Confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": "Kindly request the customer to provide in written on mail or from MyAccount:\r\nKindly confirm whether customer wants to cancel the Own damage part of the policy or want to recover the ncb."
    },
    {
        "InsurerRequirement": "Future GeneraliRegistration Date",
        "Insurer": "Future Generali",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet\r\nNEW CAR POLICY ENDT: No charges or inspection required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliRegst. Number",
        "Insurer": "Future Generali",
        "Requirement": "Regst. Number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet\r\nNEW CAR POLICY ENDT: No charges or inspection required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliRTO Endorsement",
        "Insurer": "Future Generali",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliSeating Capacity",
        "Insurer": "Future Generali",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliPeriod of Insurance (POI)",
        "Insurer": "Future Generali",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliPYP Details- POI or Insurer or Policy number",
        "Insurer": "Future Generali",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliTP details",
        "Insurer": "Future Generali",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Bundled TP or PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliCommunication Address",
        "Insurer": "Future Generali",
        "Requirement": "Communication Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Complete address with pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliDate of Birth (DOB)",
        "Insurer": "Future Generali",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliEmail Address",
        "Insurer": "Future Generali",
        "Requirement": "Email Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Complete Email ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliMobile Number",
        "Insurer": "Future Generali",
        "Requirement": "Mobile Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliNominee Details",
        "Insurer": "Future Generali",
        "Requirement": "Nominee Details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliSalutation",
        "Insurer": "Future Generali",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliOwner Driver Personal Accident",
        "Insurer": "Future Generali",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, DL, Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliPaid Driver",
        "Insurer": "Future Generali",
        "Requirement": "Paid Driver",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, Salary slip of last 3 months, DL of the driver",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliUn Named Passanger Cover",
        "Insurer": "Future Generali",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, written confirmation of coverage for Rs.50 - 1L and Rs.100/-  2L",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliCNG Addition External",
        "Insurer": "Future Generali",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG Invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliCNG Addition Company fitted",
        "Insurer": "Future Generali",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliCubic Capacity (CC)",
        "Insurer": "Future Generali",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Future Generali",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliIDV Change",
        "Insurer": "Future Generali",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliManufactured Date",
        "Insurer": "Future Generali",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliMake, Model & Variant",
        "Insurer": "Future Generali",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliOwnership Transfer",
        "Insurer": "Future Generali",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, New owner details, KYC, NOC & Proposal form (NOC & PF format availble on MyAccount)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliNCB Correction (taken extra NCB)",
        "Insurer": "Future Generali",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet\r\nIf the NCB needs to be updated to 0%, an inspection is mandatory.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliNCB Correction (taken less NCB)",
        "Insurer": "Future Generali",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliTop Up (PAYD plan)",
        "Insurer": "Future Generali",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Future Generali",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliPost Issuance Cancellation",
        "Insurer": "Future Generali",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate Policy\r\n\r\nWritten declaration with signature on KYC Xerox paper (Either PAN or Driving Licence)\r\nDeclaration wordings - I want to cancel my policy wide <<policy no.>> and proceed the refund.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "",
        "Any Exception": "For Ticketing Associates: Raise cancellation to insurer & meanwhile XML Sheet to tech",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Future Generali",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent & Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.\r\n\r\nFor ticketing associate: Raise cancellation with XML Sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Future GeneraliM-Parivahan",
        "Insurer": "Future Generali",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticketing associate: Raise endorsement with XML sheet",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioAddition of GST No.",
        "Insurer": "Iffco tokio",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured, KYC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioChassis Number",
        "Insurer": "Iffco tokio",
        "Requirement": "Chassis Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioColour Change",
        "Insurer": "Iffco tokio",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioEngine Number",
        "Insurer": "Iffco tokio",
        "Requirement": "Engine Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioHypothecation Remove",
        "Insurer": "Iffco tokio",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioHypothecation Add",
        "Insurer": "Iffco tokio",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or Loan sanction letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioHypothecation Change",
        "Insurer": "Iffco tokio",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioInsured name",
        "Insurer": "Iffco tokio",
        "Requirement": "Insured name",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC, PYP, KYC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "correction can be done Post start date of the policy \r\nProceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioNCB Certificate",
        "Insurer": "Iffco tokio",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale letter, PYP, NCB Confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": "Kindly request the customer to provide in written on mail or from MyAccount:\r\nKindly confirm whether customer wants to cancel the Own damage part of the policy or want to recover the ncb."
    },
    {
        "InsurerRequirement": "Iffco tokioRegistration Date",
        "Insurer": "Iffco tokio",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "NEW CAR POLICY ENDT: No charges or inspection required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioRegst. Number",
        "Insurer": "Iffco tokio",
        "Requirement": "Regst. Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "NEW CAR POLICY ENDT: No charges or inspection required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioRTO Endorsement",
        "Insurer": "Iffco tokio",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioSeating Capacity",
        "Insurer": "Iffco tokio",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioPeriod of Insurance (POI)",
        "Insurer": "Iffco tokio",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioPYP Details- POI or Insurer or Policy number",
        "Insurer": "Iffco tokio",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioTP details",
        "Insurer": "Iffco tokio",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Bundled TP or PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioCommunication Address",
        "Insurer": "Iffco tokio",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Address Proof",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioDate of Birth (DOB)",
        "Insurer": "Iffco tokio",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioEmail Address",
        "Insurer": "Iffco tokio",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete Email ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioMobile Number",
        "Insurer": "Iffco tokio",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioNominee Details",
        "Insurer": "Iffco tokio",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioSalutation",
        "Insurer": "Iffco tokio",
        "Requirement": "Salutation",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioOwner Driver Personal Accident",
        "Insurer": "Iffco tokio",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, Insured DL & Nominee Name, Age & Relationship",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioPaid Driver",
        "Insurer": "Iffco tokio",
        "Requirement": "Paid Driver",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, Salary slip of last 3 months, DL of the driver",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioUn Named Passanger Cover",
        "Insurer": "Iffco tokio",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, written confirmation of coverage for Rs.50 - 1L and Rs.100/-  2L",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioCNG Addition External",
        "Insurer": "Iffco tokio",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG Invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioCNG Addition Company fitted",
        "Insurer": "Iffco tokio",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioCubic Capacity (CC)",
        "Insurer": "Iffco tokio",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Iffco tokio",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioIDV Change",
        "Insurer": "Iffco tokio",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioManufactured Date",
        "Insurer": "Iffco tokio",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioMake, Model & Variant",
        "Insurer": "Iffco tokio",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioOwnership Transfer",
        "Insurer": "Iffco tokio",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, New owner details, KYC, NOC from previous owner (in a format, format is with the ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "correction possible Post start date of the policy\r\nFor ticketing associate: Raise request to insurer with NOC in the said format",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioNCB Correction (taken extra NCB)",
        "Insurer": "Iffco tokio",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioNCB Correction (taken less NCB)",
        "Insurer": "Iffco tokio",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioTop Up (PAYD plan)",
        "Insurer": "Iffco tokio",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Iffco tokio",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioPost Issuance Cancellation",
        "Insurer": "Iffco tokio",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Iffco tokio",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent & Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Iffco tokioM-Parivahan",
        "Insurer": "Iffco tokio",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "No requirement",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaAddition of GST No.",
        "Insurer": "Magma",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured, KYC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaChassis Number",
        "Insurer": "Magma",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaColour Change",
        "Insurer": "Magma",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaEngine Number",
        "Insurer": "Magma",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaHypothecation Remove",
        "Insurer": "Magma",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaHypothecation Add",
        "Insurer": "Magma",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Updated RC or Loan sanction letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaHypothecation Change",
        "Insurer": "Magma",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaInsured name",
        "Insurer": "Magma",
        "Requirement": "Insured name",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC, PYP, KYC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaNCB Certificate",
        "Insurer": "Magma",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale letter, PYP, NCB Confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": "Kindly request the customer to provide in written on mail or from MyAccount:\r\nKindly confirm whether customer wants to cancel the Own damage part of the policy or want to recover the ncb."
    },
    {
        "InsurerRequirement": "MagmaRegistration Date",
        "Insurer": "Magma",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaRegst. Number",
        "Insurer": "Magma",
        "Requirement": "Regst. Number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaRTO Endorsement",
        "Insurer": "Magma",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaSeating Capacity",
        "Insurer": "Magma",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaPeriod of Insurance (POI)",
        "Insurer": "Magma",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP,KYC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaPYP Details- POI or Insurer or Policy number",
        "Insurer": "Magma",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaTP details",
        "Insurer": "Magma",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Bundled TP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaCommunication Address",
        "Insurer": "Magma",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete address with pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaDate of Birth (DOB)",
        "Insurer": "Magma",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaEmail Address",
        "Insurer": "Magma",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete Email ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaMobile Number",
        "Insurer": "Magma",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaNominee Details",
        "Insurer": "Magma",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaSalutation",
        "Insurer": "Magma",
        "Requirement": "Salutation",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaOwner Driver Personal Accident",
        "Insurer": "Magma",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, DL, Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaPaid Driver",
        "Insurer": "Magma",
        "Requirement": "Paid Driver",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, Salary slip of last 3 months, DL of the driver",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaUn Named Passanger Cover",
        "Insurer": "Magma",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, written confirmation of coverage for Rs.50 - 1L and Rs.100/-  2L",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaCNG Addition External",
        "Insurer": "Magma",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG Invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaCNG Addition Company fitted",
        "Insurer": "Magma",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaCubic Capacity (CC)",
        "Insurer": "Magma",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Magma",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaIDV Change",
        "Insurer": "Magma",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaManufactured Date",
        "Insurer": "Magma",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaMake, Model & Variant",
        "Insurer": "Magma",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaOwnership Transfer",
        "Insurer": "Magma",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, New owner details, KYC, Proposal form (PF format availble on MyAccount)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaNCB Correction (taken extra NCB)",
        "Insurer": "Magma",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaNCB Correction (taken less NCB)",
        "Insurer": "Magma",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaTop Up (PAYD plan)",
        "Insurer": "Magma",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Magma",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaPost Issuance Cancellation",
        "Insurer": "Magma",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate Policy, KYC & NEFT details of the Insured\r\nAccount holder name - \r\nBank Name - \r\nAccount Number - \r\nIFSC Code -",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Magma",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent & Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "MagmaM-Parivahan",
        "Insurer": "Magma",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaAddition of GST No.",
        "Insurer": "Raheja",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured, KYC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN Card mandate in KYC",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaChassis Number",
        "Insurer": "Raheja",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaColour Change",
        "Insurer": "Raheja",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaEngine Number",
        "Insurer": "Raheja",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaHypothecation Remove",
        "Insurer": "Raheja",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "NOC or Updated RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaHypothecation Add",
        "Insurer": "Raheja",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or Loan sanction letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaHypothecation Change",
        "Insurer": "Raheja",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaInsured name",
        "Insurer": "Raheja",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, PYP, KYC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN Card mandate in KYC + Proceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaNCB Certificate",
        "Insurer": "Raheja",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale letter, PYP, NCB Confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": "Kindly request the customer to provide in written on mail or from MyAccount:\r\nKindly confirm whether customer wants to cancel the Own damage part of the policy or want to recover the ncb."
    },
    {
        "InsurerRequirement": "RahejaRegistration Date",
        "Insurer": "Raheja",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaRegst. Number",
        "Insurer": "Raheja",
        "Requirement": "Regst. Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaRTO Endorsement",
        "Insurer": "Raheja",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaSeating Capacity",
        "Insurer": "Raheja",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaPeriod of Insurance (POI)",
        "Insurer": "Raheja",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP & Customer declaration required on mail (I don't have any issue to cancel & rebook the insurance)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaPYP Details- POI or Insurer or Policy number",
        "Insurer": "Raheja",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaTP details",
        "Insurer": "Raheja",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Bundled TP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaCommunication Address",
        "Insurer": "Raheja",
        "Requirement": "Communication Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Address Proof",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaDate of Birth (DOB)",
        "Insurer": "Raheja",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaEmail Address",
        "Insurer": "Raheja",
        "Requirement": "Email Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Email Id",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaMobile Number",
        "Insurer": "Raheja",
        "Requirement": "Mobile Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Complete Email ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaNominee Details",
        "Insurer": "Raheja",
        "Requirement": "Nominee Details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaSalutation",
        "Insurer": "Raheja",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaOwner Driver Personal Accident",
        "Insurer": "Raheja",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaPaid Driver",
        "Insurer": "Raheja",
        "Requirement": "Paid Driver",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, Salary slip of last 3 months, DL of the driver",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaUn Named Passanger Cover",
        "Insurer": "Raheja",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, written confirmation of coverage for Rs.50 - 1L and Rs.100/-  2L",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaCNG Addition External",
        "Insurer": "Raheja",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG Invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaCNG Addition Company fitted",
        "Insurer": "Raheja",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaCubic Capacity (CC)",
        "Insurer": "Raheja",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Raheja",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaIDV Change",
        "Insurer": "Raheja",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaManufactured Date",
        "Insurer": "Raheja",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaMake, Model & Variant",
        "Insurer": "Raheja",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaOwnership Transfer",
        "Insurer": "Raheja",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, New owner details, KYC, \r\nDeclaration from old owner (Written confirmation on mail from Old owner with date & SIgnature - that he has no objection in transferring the policy to the new owner)\r\n& CPA declaration form (available with ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "PAN Card mandate in KYC",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaNCB Correction (taken extra NCB)",
        "Insurer": "Raheja",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaNCB Correction (taken less NCB)",
        "Insurer": "Raheja",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaTop Up (PAYD plan)",
        "Insurer": "Raheja",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Raheja",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaPost Issuance Cancellation",
        "Insurer": "Raheja",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Raheja",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent & Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "RahejaM-Parivahan",
        "Insurer": "Raheja",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramAddition of GST No.",
        "Insurer": "Royal Sundaram",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramChassis Number",
        "Insurer": "Royal Sundaram",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramColour Change",
        "Insurer": "Royal Sundaram",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramEngine Number",
        "Insurer": "Royal Sundaram",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramHypothecation Remove",
        "Insurer": "Royal Sundaram",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramHypothecation Add",
        "Insurer": "Royal Sundaram",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or Loan sanction letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramHypothecation Change",
        "Insurer": "Royal Sundaram",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramInsured name",
        "Insurer": "Royal Sundaram",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, PYP, KYC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramNCB Certificate",
        "Insurer": "Royal Sundaram",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale letter, PYP, NCB Confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": "Kindly request the customer to provide in written on mail or from MyAccount:\r\nKindly confirm whether customer wants to cancel the Own damage part of the policy or want to recover the ncb."
    },
    {
        "InsurerRequirement": "Royal SundaramRegistration Date",
        "Insurer": "Royal Sundaram",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramRegst. Number",
        "Insurer": "Royal Sundaram",
        "Requirement": "Regst. Number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramRTO Endorsement",
        "Insurer": "Royal Sundaram",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramSeating Capacity",
        "Insurer": "Royal Sundaram",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramPeriod of Insurance (POI)",
        "Insurer": "Royal Sundaram",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramPYP Details- POI or Insurer or Policy number",
        "Insurer": "Royal Sundaram",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramTP details",
        "Insurer": "Royal Sundaram",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Bundled TP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramCommunication Address",
        "Insurer": "Royal Sundaram",
        "Requirement": "Communication Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Complete address with pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramDate of Birth (DOB)",
        "Insurer": "Royal Sundaram",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramEmail Address",
        "Insurer": "Royal Sundaram",
        "Requirement": "Email Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Complete Email ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramMobile Number",
        "Insurer": "Royal Sundaram",
        "Requirement": "Mobile Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramNominee Details",
        "Insurer": "Royal Sundaram",
        "Requirement": "Nominee Details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramSalutation",
        "Insurer": "Royal Sundaram",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramOwner Driver Personal Accident",
        "Insurer": "Royal Sundaram",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, DL, Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Addition possible Before policy Start Date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramPaid Driver",
        "Insurer": "Royal Sundaram",
        "Requirement": "Paid Driver",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, Salary slip of last 3 months, DL of the driver",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Addition possible Before policy Start Date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramUn Named Passanger Cover",
        "Insurer": "Royal Sundaram",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, written confirmation of coverage for Rs.50 - 1L and Rs.100/-  2L",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Addition possible Before policy Start Date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramCNG Addition External",
        "Insurer": "Royal Sundaram",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG Invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramCNG Addition Company fitted",
        "Insurer": "Royal Sundaram",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramCubic Capacity (CC)",
        "Insurer": "Royal Sundaram",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Royal Sundaram",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramIDV Change",
        "Insurer": "Royal Sundaram",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramManufactured Date",
        "Insurer": "Royal Sundaram",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramMake, Model & Variant",
        "Insurer": "Royal Sundaram",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramOwnership Transfer",
        "Insurer": "Royal Sundaram",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, New owner details, KYC, Proposal form (sample available on MyAccount)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramNCB Correction (taken extra NCB)",
        "Insurer": "Royal Sundaram",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramNCB Correction (taken less NCB)",
        "Insurer": "Royal Sundaram",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramTop Up (PAYD plan)",
        "Insurer": "Royal Sundaram",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Royal Sundaram",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramPost Issuance Cancellation",
        "Insurer": "Royal Sundaram",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate Policy & Customer declaration (with customer signature)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": "Declaration on paper: I want to cancel my policy no __________ due to ___________ reason. (Along with customer's signature)"
    },
    {
        "InsurerRequirement": "Royal SundaramPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Royal Sundaram",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent, Alternate policy, Cancelled cheque",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Royal SundaramM-Parivahan",
        "Insurer": "Royal Sundaram",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoAddition of GST No.",
        "Insurer": "Zuno",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoChassis Number",
        "Insurer": "Zuno",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoColour Change",
        "Insurer": "Zuno",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoEngine Number",
        "Insurer": "Zuno",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoHypothecation Remove",
        "Insurer": "Zuno",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "NOC or Updated RC, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoHypothecation Add",
        "Insurer": "Zuno",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or Loan sanction letter, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoHypothecation Change",
        "Insurer": "Zuno",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or NOC, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoInsured name",
        "Insurer": "Zuno",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, PYP, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP\r\nFor ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoNCB Certificate",
        "Insurer": "Zuno",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale letter, PYP, NCB Confirmation letter, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": "Kindly request the customer to provide in written on mail or from MyAccount:\r\nKindly confirm whether customer wants to cancel the Own damage part of the policy or want to recover the ncb."
    },
    {
        "InsurerRequirement": "ZunoRegistration Date",
        "Insurer": "Zuno",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoRegst. Number",
        "Insurer": "Zuno",
        "Requirement": "Regst. Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoRTO Endorsement",
        "Insurer": "Zuno",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoSeating Capacity",
        "Insurer": "Zuno",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoPeriod of Insurance (POI)",
        "Insurer": "Zuno",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoPYP Details- POI or Insurer or Policy number",
        "Insurer": "Zuno",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoTP details",
        "Insurer": "Zuno",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Bundled TP, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoCommunication Address",
        "Insurer": "Zuno",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete address with pincode (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Incase raising to insurer then KYC - Pan Card and Unmasked Aadhar card is required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoDate of Birth (DOB)",
        "Insurer": "Zuno",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoEmail Address",
        "Insurer": "Zuno",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete Email ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Incase raising to insurer then KYC - Pan Card and Unmasked Aadhar card is required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoMobile Number",
        "Insurer": "Zuno",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Incase raising to insurer then KYC - Pan Card and Unmasked Aadhar card is required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoNominee Details",
        "Insurer": "Zuno",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Incase raising to insurer then KYC - Pan Card and Unmasked Aadhar card is required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoSalutation",
        "Insurer": "Zuno",
        "Requirement": "Salutation",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Incase raising to insurer then KYC - Pan Card and Unmasked Aadhar card is required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoOwner Driver Personal Accident",
        "Insurer": "Zuno",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, DL, Nominee Details, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Correction possible Before Policy Start Date, \r\nFor Ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoPaid Driver",
        "Insurer": "Zuno",
        "Requirement": "Paid Driver",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, Salary slip of last 3 months, DL of the driver, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Correction possible Before Policy Start Date, \r\nFor Ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoUn Named Passanger Cover",
        "Insurer": "Zuno",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, written confirmation of coverage for Rs.50 - 1L and Rs.100/-  2L, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Correction possible Before Policy Start Date, \r\nFor Ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoCNG Addition External",
        "Insurer": "Zuno",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG Invoice, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoCNG Addition Company fitted",
        "Insurer": "Zuno",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PYP, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoCubic Capacity (CC)",
        "Insurer": "Zuno",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Zuno",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoIDV Change",
        "Insurer": "Zuno",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoManufactured Date",
        "Insurer": "Zuno",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoMake, Model & Variant",
        "Insurer": "Zuno",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoOwnership Transfer",
        "Insurer": "Zuno",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, New owner details, KYC, Proposal form (available on MyAccount), KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoNCB Correction (taken extra NCB)",
        "Insurer": "Zuno",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoNCB Correction (taken less NCB)",
        "Insurer": "Zuno",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Yes",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoTop Up (PAYD plan)",
        "Insurer": "Zuno",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Zuno",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoPost Issuance Cancellation",
        "Insurer": "Zuno",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate Policy, KYC - Pan Card and Unmasked Aadhar card (Unmasked adhar required only incase policy number starts with 52, else masked adhar card acceptable)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "For ticketing associates: Feedfile required while raising the endorsement if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Zuno",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Cancellation and correction is not possible",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Cancellation and correction is not possible",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ZunoM-Parivahan",
        "Insurer": "Zuno",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For ticketing associates: Feedfile required while raising the case if Policy number starts with 52 series",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitAddition of GST No.",
        "Insurer": "Digit",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction possible only within a month of policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitChassis Number",
        "Insurer": "Digit",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitColour Change",
        "Insurer": "Digit",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitEngine Number",
        "Insurer": "Digit",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitHypothecation Remove",
        "Insurer": "Digit",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitHypothecation Add",
        "Insurer": "Digit",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or Loan sanction letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitHypothecation Change",
        "Insurer": "Digit",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitInsured name",
        "Insurer": "Digit",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, PYP, KYC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitNCB Certificate",
        "Insurer": "Digit",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale letter, PYP, NCB Confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": "Kindly request the customer to provide in written on mail or from MyAccount:\r\nKindly confirm whether customer wants to cancel the Own damage part of the policy or want to recover the ncb."
    },
    {
        "InsurerRequirement": "DigitRegistration Date",
        "Insurer": "Digit",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitRegst. Number",
        "Insurer": "Digit",
        "Requirement": "Regst. Number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitRTO Endorsement",
        "Insurer": "Digit",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitSeating Capacity",
        "Insurer": "Digit",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitPeriod of Insurance (POI)",
        "Insurer": "Digit",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction possible before policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitPYP Details- POI or Insurer or Policy number",
        "Insurer": "Digit",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitTP details",
        "Insurer": "Digit",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Bundled TP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitCommunication Address",
        "Insurer": "Digit",
        "Requirement": "Communication Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Complete address with pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitDate of Birth (DOB)",
        "Insurer": "Digit",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitEmail Address",
        "Insurer": "Digit",
        "Requirement": "Email Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Complete Email ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitMobile Number",
        "Insurer": "Digit",
        "Requirement": "Mobile Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitNominee Details",
        "Insurer": "Digit",
        "Requirement": "Nominee Details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitSalutation",
        "Insurer": "Digit",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitOwner Driver Personal Accident",
        "Insurer": "Digit",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Nominee Details & Customer Consent",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Correction possible before policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitPaid Driver",
        "Insurer": "Digit",
        "Requirement": "Paid Driver",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Only",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Correction possible before policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitUn Named Passanger Cover",
        "Insurer": "Digit",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, written confirmation of coverage for Rs.50 - 1L and Rs.100/-  2L",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Correction possible before policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitCNG Addition External",
        "Insurer": "Digit",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG Invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitCNG Addition Company fitted",
        "Insurer": "Digit",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitCubic Capacity (CC)",
        "Insurer": "Digit",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Digit",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitIDV Change",
        "Insurer": "Digit",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitManufactured Date",
        "Insurer": "Digit",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitMake, Model & Variant",
        "Insurer": "Digit",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitOwnership Transfer",
        "Insurer": "Digit",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, New owner details, KYC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitNCB Correction (taken extra NCB)",
        "Insurer": "Digit",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitNCB Correction (taken less NCB)",
        "Insurer": "Digit",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP, NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitTop Up (PAYD plan)",
        "Insurer": "Digit",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Customer consent for Top up Limit",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Digit",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitPost Issuance Cancellation",
        "Insurer": "Digit",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deductible",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Digit",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent & Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "DigitM-Parivahan",
        "Insurer": "Digit",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "No Requirement",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaAddition of GST No.",
        "Insurer": "Chola",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaChassis Number",
        "Insurer": "Chola",
        "Requirement": "Chassis Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaColour Change",
        "Insurer": "Chola",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaEngine Number",
        "Insurer": "Chola",
        "Requirement": "Engine Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaHypothecation Remove",
        "Insurer": "Chola",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Bank NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaHypothecation Add",
        "Insurer": "Chola",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Updated RC  or Loan Sanction letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaHypothecation Change",
        "Insurer": "Chola",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Updated RC and Previous Bank NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaInsured name",
        "Insurer": "Chola",
        "Requirement": "Insured name",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC ,PYP and Umasked Aadhar Card",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaNCB Certificate",
        "Insurer": "Chola",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sell Letter with stamp / RC cancellation receipt or NCB Recovery (Charges)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaRegistration Date",
        "Insurer": "Chola",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "Correction not possible in Bundle Policy",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaRegst. Number",
        "Insurer": "Chola",
        "Requirement": "Regst. Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaRTO Endorsement",
        "Insurer": "Chola",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaSeating Capacity",
        "Insurer": "Chola",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaPeriod of Insurance (POI)",
        "Insurer": "Chola",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Previous Year Policy (Backdated POI request - correction not Possible)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaPYP Details- POI or Insurer or Policy number",
        "Insurer": "Chola",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Previous Year Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaTP details",
        "Insurer": "Chola",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "TP Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaCommunication Address",
        "Insurer": "Chola",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Written consent",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaDate of Birth (DOB)",
        "Insurer": "Chola",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaEmail Address",
        "Insurer": "Chola",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "updated email id",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaMobile Number",
        "Insurer": "Chola",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "updated mobile no.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaNominee Details",
        "Insurer": "Chola",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee details ( if PA cover is added)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaSalutation",
        "Insurer": "Chola",
        "Requirement": "Salutation",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaOwner Driver Personal Accident",
        "Insurer": "Chola",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaPaid Driver",
        "Insurer": "Chola",
        "Requirement": "Paid Driver",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaUn Named Passanger Cover",
        "Insurer": "Chola",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaCNG Addition External",
        "Insurer": "Chola",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC and CNG Invoice Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaCNG Addition Company fitted",
        "Insurer": "Chola",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaCubic Capacity (CC)",
        "Insurer": "Chola",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Chola",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaIDV Change",
        "Insurer": "Chola",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaManufactured Date",
        "Insurer": "Chola",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaMake, Model & Variant",
        "Insurer": "Chola",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaOwnership Transfer",
        "Insurer": "Chola",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Self Financial Endt",
        "Documents or any other requirement": "RC, New owner details and Umasked Aadhar Card  ( need to raise to insurer in case of reg. no. change)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaNCB Correction (taken extra NCB)",
        "Insurer": "Chola",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy and NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaNCB Correction (taken less NCB)",
        "Insurer": "Chola",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy and NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaTop Up (PAYD plan)",
        "Insurer": "Chola",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Chola",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaPost Issuance Cancellation",
        "Insurer": "Chola",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Chola",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent & Alternate policy and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CholaM-Parivahan",
        "Insurer": "Chola",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajAddition of GST No.",
        "Insurer": "Bajaj",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajChassis Number",
        "Insurer": "Bajaj",
        "Requirement": "Chassis Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajColour Change",
        "Insurer": "Bajaj",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Not Possible",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajEngine Number",
        "Insurer": "Bajaj",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajHypothecation Remove",
        "Insurer": "Bajaj",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Bank NOC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajHypothecation Add",
        "Insurer": "Bajaj",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC  or Loan Sanction letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajHypothecation Change",
        "Insurer": "Bajaj",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC and Previous Bank NOC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajInsured name",
        "Insurer": "Bajaj",
        "Requirement": "Insured name",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "RC and Previous Year Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajNCB Certificate",
        "Insurer": "Bajaj",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale letter & RC (In case of vehicle sold out)\r\nRC and Customer request (If vehicle retained)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "Maybe",
        "Any Exception": "Cacellation Decalration Required : \r\nSell letter required if cx wants to cancel the policy and OD premium will be refund and Third party premium will be retained by insurer\r\nIf cx don't want to cancel the policy then NCB Recovery and inspection will be applicable (Sell letter will be required in case of OT)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajRegistration Date",
        "Insurer": "Bajaj",
        "Requirement": "Registration Date",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC  , Unmasked Aadhar card",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajRegst. Number",
        "Insurer": "Bajaj",
        "Requirement": "Regst. Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Incase of State change (for eg: MH to DL), then RTO receipt will be required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajRTO Endorsement",
        "Insurer": "Bajaj",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajSeating Capacity",
        "Insurer": "Bajaj",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC  and Unmasked Aadhar card",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajPeriod of Insurance (POI)",
        "Insurer": "Bajaj",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC  ,Previous Year Policy and Unmasked Aadhar card",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajPYP Details- POI or Insurer or Policy number",
        "Insurer": "Bajaj",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC  ,Previous Year Policy and Unmasked Aadhar card",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajTP details",
        "Insurer": "Bajaj",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC  ,Previous Year Policy , Bundle Policy and Unmasked Aadhar card",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajCommunication Address",
        "Insurer": "Bajaj",
        "Requirement": "Communication Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Complete Address with Pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajDate of Birth (DOB)",
        "Insurer": "Bajaj",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajEmail Address",
        "Insurer": "Bajaj",
        "Requirement": "Email Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Email Id",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajMobile Number",
        "Insurer": "Bajaj",
        "Requirement": "Mobile Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Mobile No.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajNominee Details",
        "Insurer": "Bajaj",
        "Requirement": "Nominee Details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajSalutation",
        "Insurer": "Bajaj",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Correct Salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajOwner Driver Personal Accident",
        "Insurer": "Bajaj",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC ,Driving License ,pan card and Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajPaid Driver",
        "Insurer": "Bajaj",
        "Requirement": "Paid Driver",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC ,Unmasked Aadhar card of Insured , Driving License  of Driver and 3 Months Salary slip",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajUn Named Passanger Cover",
        "Insurer": "Bajaj",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC  ,Unmasked Aadhar card   and written confirmation of coverage for Rs.50 - 1L and Rs.100/-  2L",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajCNG Addition External",
        "Insurer": "Bajaj",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC and CNG Invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajCNG Addition Company fitted",
        "Insurer": "Bajaj",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajCubic Capacity (CC)",
        "Insurer": "Bajaj",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC  and  Unmasked Aadhar card",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Raise to insurer with Quote with correct cc",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Bajaj",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajIDV Change",
        "Insurer": "Bajaj",
        "Requirement": "IDV Change",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Unmasked Aadhar card and Renewal Notice (which customer receives at the time of booking)",
        "TAT": "Not Possible",
        "Charges / Deduction": "May be",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajManufactured Date",
        "Insurer": "Bajaj",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC  , Unmasked Aadhar card",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajMake, Model & Variant",
        "Insurer": "Bajaj",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC  , Unmasked Aadhar card",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "Maybe",
        "Any Exception": "For ticket associate: Raise to insurer with Quote with MMV",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajOwnership Transfer",
        "Insurer": "Bajaj",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC and Proposal Form",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajNCB Correction (taken extra NCB)",
        "Insurer": "Bajaj",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy and confirmation if customer has taken claim or not",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "Verbal confirmation if customer has taken claim or not",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajNCB Correction (taken less NCB)",
        "Insurer": "Bajaj",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy and confirmation if customer has taken claim or not",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajTop Up (PAYD plan)",
        "Insurer": "Bajaj",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC and Unmasked Aadhar card and written or verbal confirmation for KM (min 2,000 km & max 6,000 km)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Bajaj",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajPost Issuance Cancellation",
        "Insurer": "Bajaj",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "cancellation is possible before policy start date without alternate policy, note that request to be raised before 24 hrs of policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Bajaj",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer Consent",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "BajajM-Parivahan",
        "Insurer": "Bajaj",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "No Requirement",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyAddition of GST No.",
        "Insurer": "Liberty",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyChassis Number",
        "Insurer": "Liberty",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyColour Change",
        "Insurer": "Liberty",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyEngine Number",
        "Insurer": "Liberty",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyHypothecation Remove",
        "Insurer": "Liberty",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC  ,Bank NOC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyHypothecation Add",
        "Insurer": "Liberty",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC  or Loan Sanction letter & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyHypothecation Change",
        "Insurer": "Liberty",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC  ,Previous Bank NOC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyInsured name",
        "Insurer": "Liberty",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC  , Masked Aadhar Card , pan card ,Previous Year Policy & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Will be considered as o/t incase of complete name mismatch\r\nFor Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyNCB Certificate",
        "Insurer": "Liberty",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sell letter , Previous Year Policy , NCB Confirmation and cancellation declaration",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyRegistration Date",
        "Insurer": "Liberty",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "Maybe",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyRegst. Number",
        "Insurer": "Liberty",
        "Requirement": "Regst. Number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyRTO Endorsement",
        "Insurer": "Liberty",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertySeating Capacity",
        "Insurer": "Liberty",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyPeriod of Insurance (POI)",
        "Insurer": "Liberty",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC ,previous Year Policy & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Backdated correction not possible \r\nFor Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyPYP Details- POI or Insurer or Policy number",
        "Insurer": "Liberty",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC ,previous Year Policy & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyTP details",
        "Insurer": "Liberty",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC ,previous Year Policy ,bundle Policy  & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyCommunication Address",
        "Insurer": "Liberty",
        "Requirement": "Communication Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Address Proof & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyDate of Birth (DOB)",
        "Insurer": "Liberty",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyEmail Address",
        "Insurer": "Liberty",
        "Requirement": "Email Address",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyMobile Number",
        "Insurer": "Liberty",
        "Requirement": "Mobile Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyNominee Details",
        "Insurer": "Liberty",
        "Requirement": "Nominee Details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertySalutation",
        "Insurer": "Liberty",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyOwner Driver Personal Accident",
        "Insurer": "Liberty",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyPaid Driver",
        "Insurer": "Liberty",
        "Requirement": "Paid Driver",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyUn Named Passanger Cover",
        "Insurer": "Liberty",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyCNG Addition External",
        "Insurer": "Liberty",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC  , CNG Invoice & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "For ticket associate: \r\nEndorsement form to be filled and raised to insurer \r\nInspection to be raised from Insurer portal (from insurer end)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyCNG Addition Company fitted",
        "Insurer": "Liberty",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyCubic Capacity (CC)",
        "Insurer": "Liberty",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Liberty",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyIDV Change",
        "Insurer": "Liberty",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyManufactured Date",
        "Insurer": "Liberty",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyMake, Model & Variant",
        "Insurer": "Liberty",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyOwnership Transfer",
        "Insurer": "Liberty",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC ,Masked Aadhar card and Pan Card  , NOC and Transfer Form (will be provided by TL / Ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "For ticket associate: \r\nEndorsement form to be filled and raised to insurer \r\nInspection to be raised from Insurer portal (from insurer end)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyNCB Correction (taken extra NCB)",
        "Insurer": "Liberty",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy and written consent",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "For Ticket associate: Inspection to be raised from Insurer portal (from insurer end)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyNCB Correction (taken less NCB)",
        "Insurer": "Liberty",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy  and NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Yes",
        "Any Exception": "For Ticket associate: Inspection to be raised from Insurer portal (from insurer end)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyTop Up (PAYD plan)",
        "Insurer": "Liberty",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Liberty",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyPost Issuance Cancellation",
        "Insurer": "Liberty",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Policy period not started:\r\nEndorsement form (will be provided by TL / ticketing team)\r\n\r\nPolicy period started:\r\nAlternate Policy and Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Liberty",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Not Possible",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "LibertyM-Parivahan",
        "Insurer": "Liberty",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalAddition of GST No.",
        "Insurer": "National",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalChassis Number",
        "Insurer": "National",
        "Requirement": "Chassis Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalColour Change",
        "Insurer": "National",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalEngine Number",
        "Insurer": "National",
        "Requirement": "Engine Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalHypothecation Remove",
        "Insurer": "National",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Bank NOC and Updated RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalHypothecation Add",
        "Insurer": "National",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC  or Loan Sanction letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalHypothecation Change",
        "Insurer": "National",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC and  Previous Bank NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalInsured name",
        "Insurer": "National",
        "Requirement": "Insured name",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC , Previous year policy, Unmasked Aadhar or pan + (Rs 60/- Charges applicable in package policy)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalNCB Certificate",
        "Insurer": "National",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Updated RC, Sell letter or RTO Receipt, PYP , NCB confirmation and cancellation declaration",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "Updated RC will not be required after policy expiry (possible on the basis of NCB confirmation letter)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalRegistration Date",
        "Insurer": "National",
        "Requirement": "Registration Date",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalRegst. Number",
        "Insurer": "National",
        "Requirement": "Regst. Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalRTO Endorsement",
        "Insurer": "National",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalSeating Capacity",
        "Insurer": "National",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalPeriod of Insurance (POI)",
        "Insurer": "National",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalPYP Details- POI or Insurer or Policy number",
        "Insurer": "National",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Previous Year Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalTP details",
        "Insurer": "National",
        "Requirement": "TP details",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Bundle Policy Required(POI not possible)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalCommunication Address",
        "Insurer": "National",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete address required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalDate of Birth (DOB)",
        "Insurer": "National",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalEmail Address",
        "Insurer": "National",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Updated Email Id",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalMobile Number",
        "Insurer": "National",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Updated mobile no.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalNominee Details",
        "Insurer": "National",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalSalutation",
        "Insurer": "National",
        "Requirement": "Salutation",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalOwner Driver Personal Accident",
        "Insurer": "National",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalPaid Driver",
        "Insurer": "National",
        "Requirement": "Paid Driver",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalUn Named Passanger Cover",
        "Insurer": "National",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalCNG Addition External",
        "Insurer": "National",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC and CNG Invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalCNG Addition Company fitted",
        "Insurer": "National",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalCubic Capacity (CC)",
        "Insurer": "National",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "National",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalIDV Change",
        "Insurer": "National",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalManufactured Date",
        "Insurer": "National",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalMake, Model & Variant",
        "Insurer": "National",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalOwnership Transfer",
        "Insurer": "National",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC , New owner details and Unmasked Aadhar or pan of new insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalNCB Correction (taken extra NCB)",
        "Insurer": "National",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year policy and NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalNCB Correction (taken less NCB)",
        "Insurer": "National",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year policy and NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalTop Up (PAYD plan)",
        "Insurer": "National",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "National",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalPost Issuance Cancellation",
        "Insurer": "National",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Alternate Policy , Written Consent and NEFT of insured as per policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "No",
        "Any Exception": "Alternate should be comprehensive, incase of alternate TP, the later issued policy will be cancelled",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "National",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent and Cancelled cheque  as per policy (For OD Refund  only)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "NationalM-Parivahan",
        "Insurer": "National",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "No requirement",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindAddition of GST No.",
        "Insurer": "Indusind",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured, RC &  Pan Card",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction not possible in Xpas plan",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindChassis Number",
        "Insurer": "Indusind",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindColour Change",
        "Insurer": "Indusind",
        "Requirement": "Colour Change",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindEngine Number",
        "Insurer": "Indusind",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindHypothecation Remove",
        "Insurer": "Indusind",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Customer Request Letter\r\nEndorsed RC Copy / NOC from Financier",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindHypothecation Add",
        "Insurer": "Indusind",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Customer Request Letter and RC Copy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindHypothecation Change",
        "Insurer": "Indusind",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Customer Request Letter\r\n              Endorsed RC Copy / Financier letter / Sanction Letter from Financial Institute",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindInsured name",
        "Insurer": "Indusind",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC,KYC , PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindNCB Certificate",
        "Insurer": "Indusind",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "If Vehicle not sold: \r\nOnly Customer declaration required - \"Vehicle not sold and I want to purchase new car. Kindly send ncb recovery link. I am ready to pay ncb recovery amount\r\n\r\nIf vehicle sold and the policy transfered to New owner name: \r\nSell letter\r\n\r\nIf vehicle sold and the policy not transferred:\r\na) If New owner booked new insurance and the older owner have the access to the same -  Sell letter and alternate policy shared with new owner name (current policy will be cancelled)\r\n\r\nb) If New owner booked new insurance and the older owner do not have the access to the same -  Sell letter and Form 29-30 with sale letter, with customer declaration that he/she is okay with \"OD part will be cancelled and TP will be retain\"",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "NCB Certificate will be issued only if vehcle is sold with in policy period (the same could be processed if request received after policy End date under 90 days with sale proof)\r\n\r\nCancelled cheque will additionally be required if customer is requesting for Ncb Certificate after 170 days from policy start date\r\n\r\nKYC docs (Pan and Aadhar) will be required if cancellation is requied",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindRegistration Date",
        "Insurer": "Indusind",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindRegst. Number",
        "Insurer": "Indusind",
        "Requirement": "Regst. Number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindRTO Endorsement",
        "Insurer": "Indusind",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindSeating Capacity",
        "Insurer": "Indusind",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindPeriod of Insurance (POI)",
        "Insurer": "Indusind",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC,KYC , PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "Correction not possible in PAYD plan or Policies having same policy format as PAYD policy",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindPYP Details- POI or Insurer or Policy number",
        "Insurer": "Indusind",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC,KYC , PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindTP details",
        "Insurer": "Indusind",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC,KYC , PYP and Bundle Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindCommunication Address",
        "Insurer": "Indusind",
        "Requirement": "Communication Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Complete Address with pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Nil Endt incase of Xpas plan",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindDate of Birth (DOB)",
        "Insurer": "Indusind",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "NA",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindEmail Address",
        "Insurer": "Indusind",
        "Requirement": "Email Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated email id",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Nil Endt incase of Xpas plan",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindMobile Number",
        "Insurer": "Indusind",
        "Requirement": "Mobile Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated mobile no.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Nil Endt incase of Xpas plan",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindNominee Details",
        "Insurer": "Indusind",
        "Requirement": "Nominee Details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Nominee ID proof",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Nil Endt incase of Xpas plan",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindSalutation",
        "Insurer": "Indusind",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Insured ID Proof",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Nil Endt incase of Xpas plan",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindOwner Driver Personal Accident",
        "Insurer": "Indusind",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindPaid Driver",
        "Insurer": "Indusind",
        "Requirement": "Paid Driver",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindUn Named Passanger Cover",
        "Insurer": "Indusind",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindCNG Addition External",
        "Insurer": "Indusind",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC and CNG Invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Inspection to be raised from Reliance portal (from insurer end)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindCNG Addition Company fitted",
        "Insurer": "Indusind",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Inspection to be raised from Reliance portal (from insurer end)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindCubic Capacity (CC)",
        "Insurer": "Indusind",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Indusind",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindIDV Change",
        "Insurer": "Indusind",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindManufactured Date",
        "Insurer": "Indusind",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindMake, Model & Variant",
        "Insurer": "Indusind",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "May Be",
        "Inspection": "Maybe",
        "Any Exception": "Inspection to be raised from Reliance portal (from insurer end)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindOwnership Transfer",
        "Insurer": "Indusind",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC , NOC ,New owner details and Pa Cover declaration",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "Inspection to be raised from Reliance portal (from insurer end)\r\n\r\nIf RC transfer process has been initiated in the RTO (From vehicle Transfer Date to 14 days):\r\n\r\nThen request could be processed using RTO receipt and without inspection",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindNCB Correction (taken extra NCB)",
        "Insurer": "Indusind",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP and NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Inspection to be raised from Reliance portal (from insurer end)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindNCB Correction (taken less NCB)",
        "Insurer": "Indusind",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP and NCB Confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindTop Up (PAYD plan)",
        "Insurer": "Indusind",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Cx request from my account (Kms to top up)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Indusind",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindPost Issuance Cancellation",
        "Insurer": "Indusind",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "RC (Mandatory) & Alternate Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Indusind",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent & Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "IndusindM-Parivahan",
        "Insurer": "Indusind",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalAddition of GST No.",
        "Insurer": "Oriental",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalChassis Number",
        "Insurer": "Oriental",
        "Requirement": "Chassis Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalColour Change",
        "Insurer": "Oriental",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalEngine Number",
        "Insurer": "Oriental",
        "Requirement": "Engine Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalHypothecation Remove",
        "Insurer": "Oriental",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "NOC Or Updated RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalHypothecation Add",
        "Insurer": "Oriental",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or Loan Sanction Letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalHypothecation Change",
        "Insurer": "Oriental",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Updated RC and Loan Sanction Letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalInsured name",
        "Insurer": "Oriental",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, PYP and KYC of RC owner, Customer Declaration",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": "Kindly ask the customer to share below declaration on mail: \r\n\"I certify that I have applied for the Correction in Insured name in policy no. __________________. This is not the case of Ownership transfer and there is no known or reported loss till date. I certify that the above facts are true to the best of my knowledge and if found false, I am liable for it and Insurer has the right to cancel the policy without any refund.\""
    },
    {
        "InsurerRequirement": "OrientalNCB Certificate",
        "Insurer": "Oriental",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Form 29/30\r\nor\r\nUpdated RC with transferred date",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Charges would not be required incase policy has expired",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalRegistration Date",
        "Insurer": "Oriental",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalRegst. Number",
        "Insurer": "Oriental",
        "Requirement": "Regst. Number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Charges may be applicable incase of state / RTO code change",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalRTO Endorsement",
        "Insurer": "Oriental",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalSeating Capacity",
        "Insurer": "Oriental",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalPeriod of Insurance (POI)",
        "Insurer": "Oriental",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalPYP Details- POI or Insurer or Policy number",
        "Insurer": "Oriental",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalTP details",
        "Insurer": "Oriental",
        "Requirement": "TP details",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Third party Bundle Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalCommunication Address",
        "Insurer": "Oriental",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete address with pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalDate of Birth (DOB)",
        "Insurer": "Oriental",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete DOB",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalEmail Address",
        "Insurer": "Oriental",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete Email ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalMobile Number",
        "Insurer": "Oriental",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalNominee Details",
        "Insurer": "Oriental",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalSalutation",
        "Insurer": "Oriental",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalOwner Driver Personal Accident",
        "Insurer": "Oriental",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalPaid Driver",
        "Insurer": "Oriental",
        "Requirement": "Paid Driver",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalUn Named Passanger Cover",
        "Insurer": "Oriental",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalCNG Addition External",
        "Insurer": "Oriental",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG invoice or PYP with CNG value",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalCNG Addition Company fitted",
        "Insurer": "Oriental",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Copy and PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalCubic Capacity (CC)",
        "Insurer": "Oriental",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC charges may be applicable",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Oriental",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalIDV Change",
        "Insurer": "Oriental",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalManufactured Date",
        "Insurer": "Oriental",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalMake, Model & Variant",
        "Insurer": "Oriental",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalOwnership Transfer",
        "Insurer": "Oriental",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, KYC, New owner detail, Customer Declaration",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Inspection not required if RC transfer process has been initiated (From Transfer Date to 14 days).\r\n\r\nNote :- This should be valid from RC transfer date and Insurer require RTO receipt to proceed this further.",
        "Declaration format (if declaration required)": "Kindly ask the customer to share below declaration on mail: \r\n\"I certify that I have applied for the transfer of ownership in policy no. __________________ and there is no known or reported loss till date. I certify that the above facts are true to the best of my knowledge and if found false, I am liable for it and Insurer has the right to cancel the policy without any refund.\""
    },
    {
        "InsurerRequirement": "OrientalNCB Correction (taken extra NCB)",
        "Insurer": "Oriental",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalNCB Correction (taken less NCB)",
        "Insurer": "Oriental",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP and NCB confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalTop Up (PAYD plan)",
        "Insurer": "Oriental",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Oriental",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalPost Issuance Cancellation",
        "Insurer": "Oriental",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate Policy, Reason and Declaration",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "No",
        "Any Exception": "To be raised on Mail",
        "Declaration format (if declaration required)": "Complete reason for cancellation from customer's registered email ID along with requested date and time, Declaration :- There is no claim running in the policy"
    },
    {
        "InsurerRequirement": "OrientalPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Oriental",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "OrientalM-Parivahan",
        "Insurer": "Oriental",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoAddition of GST No.",
        "Insurer": "Universal Sompo",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoChassis Number",
        "Insurer": "Universal Sompo",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoColour Change",
        "Insurer": "Universal Sompo",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoEngine Number",
        "Insurer": "Universal Sompo",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoHypothecation Remove",
        "Insurer": "Universal Sompo",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "NOC or Updated RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoHypothecation Add",
        "Insurer": "Universal Sompo",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Updated RC or Loan Sanction Letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoHypothecation Change",
        "Insurer": "Universal Sompo",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Updated RC and Loan Sanction Letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoInsured name",
        "Insurer": "Universal Sompo",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, PYP and KYC of RC owner",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For KYC: CKYC number or PAN and Adhar will required \r\nProceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoNCB Certificate",
        "Insurer": "Universal Sompo",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale Letter or Updated RC , PYP and NCB confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoRegistration Date",
        "Insurer": "Universal Sompo",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoRegst. Number",
        "Insurer": "Universal Sompo",
        "Requirement": "Regst. Number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoRTO Endorsement",
        "Insurer": "Universal Sompo",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoSeating Capacity",
        "Insurer": "Universal Sompo",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoPeriod of Insurance (POI)",
        "Insurer": "Universal Sompo",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoPYP Details- POI or Insurer or Policy number",
        "Insurer": "Universal Sompo",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoTP details",
        "Insurer": "Universal Sompo",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Third party Bundle Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoCommunication Address",
        "Insurer": "Universal Sompo",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete address with pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoDate of Birth (DOB)",
        "Insurer": "Universal Sompo",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete DOB",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoEmail Address",
        "Insurer": "Universal Sompo",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete Email ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoMobile Number",
        "Insurer": "Universal Sompo",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoNominee Details",
        "Insurer": "Universal Sompo",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoSalutation",
        "Insurer": "Universal Sompo",
        "Requirement": "Salutation",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoOwner Driver Personal Accident",
        "Insurer": "Universal Sompo",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoPaid Driver",
        "Insurer": "Universal Sompo",
        "Requirement": "Paid Driver",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoUn Named Passanger Cover",
        "Insurer": "Universal Sompo",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoCNG Addition External",
        "Insurer": "Universal Sompo",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG Kit invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoCNG Addition Company fitted",
        "Insurer": "Universal Sompo",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Copy, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoCubic Capacity (CC)",
        "Insurer": "Universal Sompo",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Universal Sompo",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoIDV Change",
        "Insurer": "Universal Sompo",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoManufactured Date",
        "Insurer": "Universal Sompo",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoMake, Model & Variant",
        "Insurer": "Universal Sompo",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoOwnership Transfer",
        "Insurer": "Universal Sompo",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, KYC, New owner detail",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "For KYC: CKYC number or PAN and Adhar will required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoNCB Correction (taken extra NCB)",
        "Insurer": "Universal Sompo",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP & NCB confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoNCB Correction (taken less NCB)",
        "Insurer": "Universal Sompo",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP & NCB confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoTop Up (PAYD plan)",
        "Insurer": "Universal Sompo",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Kilometers to be top up",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Odometer only inspection required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Universal Sompo",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Not Possible",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoPost Issuance Cancellation",
        "Insurer": "Universal Sompo",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate Policy (should be updated on vahan)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Universal Sompo",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent & Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "Universal SompoM-Parivahan",
        "Insurer": "Universal Sompo",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramAddition of GST No.",
        "Insurer": "Shriram",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction possible only on the same month of booking (For eg: Booking date is 27th Jan, correction only possible till 31st Jan)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramChassis Number",
        "Insurer": "Shriram",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramColour Change",
        "Insurer": "Shriram",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramEngine Number",
        "Insurer": "Shriram",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramHypothecation Remove",
        "Insurer": "Shriram",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "NOC and updated RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramHypothecation Add",
        "Insurer": "Shriram",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Updated RC or Loan Sanction Letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramHypothecation Change",
        "Insurer": "Shriram",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Updated RC or Loan Sanction Letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramInsured name",
        "Insurer": "Shriram",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, PYP and KYC(Aadhaar & Pan)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramNCB Certificate",
        "Insurer": "Shriram",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale Letter and Updated RC or form 29 and 30 with rto stamp , PYP and NCB confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "For ticketing associate: Need to raise on mail",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramRegistration Date",
        "Insurer": "Shriram",
        "Requirement": "Registration Date",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramRegst. Number",
        "Insurer": "Shriram",
        "Requirement": "Regst. Number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramRTO Endorsement",
        "Insurer": "Shriram",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramSeating Capacity",
        "Insurer": "Shriram",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Commercial - If seating capacity is incorrectly mentioned and the customer requests a correction where the seating capacity is above 7, corrections is not possible as per insurer, need to proceed with cancellation",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramPeriod of Insurance (POI)",
        "Insurer": "Shriram",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramPYP Details- POI or Insurer or Policy number",
        "Insurer": "Shriram",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramTP details",
        "Insurer": "Shriram",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Third party Bundle Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramCommunication Address",
        "Insurer": "Shriram",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete address with pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramDate of Birth (DOB)",
        "Insurer": "Shriram",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete DOB",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramEmail Address",
        "Insurer": "Shriram",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete Email ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramMobile Number",
        "Insurer": "Shriram",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramNominee Details",
        "Insurer": "Shriram",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramSalutation",
        "Insurer": "Shriram",
        "Requirement": "Salutation",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramOwner Driver Personal Accident",
        "Insurer": "Shriram",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Copy, Nominee detail. DL",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramPaid Driver",
        "Insurer": "Shriram",
        "Requirement": "Paid Driver",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, DL of driver, Salary slip or bank statement",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramUn Named Passanger Cover",
        "Insurer": "Shriram",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC & confirmation from cx if he wants to opt Rs 50/seat or Rs 100/seat",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramCNG Addition External",
        "Insurer": "Shriram",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC copy, CNG Kit invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramCNG Addition Company fitted",
        "Insurer": "Shriram",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Copy, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramCubic Capacity (CC)",
        "Insurer": "Shriram",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Shriram",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramIDV Change",
        "Insurer": "Shriram",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramManufactured Date",
        "Insurer": "Shriram",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramMake, Model & Variant",
        "Insurer": "Shriram",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramOwnership Transfer",
        "Insurer": "Shriram",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, KYC, New owner detail, RC transfer Date, New Owner's father name",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "KYC - Pan and Aadhar card mandatory",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramNCB Correction (taken extra NCB)",
        "Insurer": "Shriram",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP & NCB confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Maybe",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramNCB Correction (taken less NCB)",
        "Insurer": "Shriram",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP & NCB confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramTop Up (PAYD plan)",
        "Insurer": "Shriram",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Confirmation from the customer if he/she is okay with Plan update to normal",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Top up not possible, plan can be changed from PAYD to regular",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Shriram",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramPost Issuance Cancellation",
        "Insurer": "Shriram",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Policy period not started:\r\nCancellation can be done based on active PYP, cancellation can be raised if active PYP is expiring same day\r\n(don’t raise Same day expiry post Friday 4 PM, Saturday & Sunday)\r\n\r\nPolicy period started:\r\nAlternate Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Shriram",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent & Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ShriramM-Parivahan",
        "Insurer": "Shriram",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakAddition of GST No.",
        "Insurer": "Kotak",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakChassis Number",
        "Insurer": "Kotak",
        "Requirement": "Chassis Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakColour Change",
        "Insurer": "Kotak",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakEngine Number",
        "Insurer": "Kotak",
        "Requirement": "Engine Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakHypothecation Remove",
        "Insurer": "Kotak",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "NOC or Updated RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakHypothecation Add",
        "Insurer": "Kotak",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC or Loan Sanction Letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakHypothecation Change",
        "Insurer": "Kotak",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated RC and Loan Sanction Letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakInsured name",
        "Insurer": "Kotak",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, PYP and KYC of RC owner",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar (If CKYC not done) \r\nProceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakNCB Certificate",
        "Insurer": "Kotak",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale Letter or Updated RC , PYP and NCB confirmation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakRegistration Date",
        "Insurer": "Kotak",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakRegst. Number",
        "Insurer": "Kotak",
        "Requirement": "Regst. Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakRTO Endorsement",
        "Insurer": "Kotak",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakSeating Capacity",
        "Insurer": "Kotak",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakPeriod of Insurance (POI)",
        "Insurer": "Kotak",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakPYP Details- POI or Insurer or Policy number",
        "Insurer": "Kotak",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakTP details",
        "Insurer": "Kotak",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Third party Bundle Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakCommunication Address",
        "Insurer": "Kotak",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete address with pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakDate of Birth (DOB)",
        "Insurer": "Kotak",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete DOB",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakEmail Address",
        "Insurer": "Kotak",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Complete Email ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakMobile Number",
        "Insurer": "Kotak",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakNominee Details",
        "Insurer": "Kotak",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee Details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakSalutation",
        "Insurer": "Kotak",
        "Requirement": "Salutation",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "correct salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakOwner Driver Personal Accident",
        "Insurer": "Kotak",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Copy, Nominee detail. DL",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Endt possible before policy start date \r\n PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakPaid Driver",
        "Insurer": "Kotak",
        "Requirement": "Paid Driver",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, DL of driver, Salary slip or bank statement",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Endt possible before policy start date \r\n PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakUn Named Passanger Cover",
        "Insurer": "Kotak",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC & confirmation from cx if he wants to opt Rs 50/seat or Rs 100/seat",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Endt possible before policy start date \r\n PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakCNG Addition External",
        "Insurer": "Kotak",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC & CNG Kit invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakCNG Addition Company fitted",
        "Insurer": "Kotak",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Copy ,PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakCubic Capacity (CC)",
        "Insurer": "Kotak",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "Kotak",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakIDV Change",
        "Insurer": "Kotak",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakManufactured Date",
        "Insurer": "Kotak",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakMake, Model & Variant",
        "Insurer": "Kotak",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakOwnership Transfer",
        "Insurer": "Kotak",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, KYC, New owner detail",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakNCB Correction (taken extra NCB)",
        "Insurer": "Kotak",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP & NCB confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakNCB Correction (taken less NCB)",
        "Insurer": "Kotak",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "PYP & NCB confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Yes",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakTop Up (PAYD plan)",
        "Insurer": "Kotak",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "Kotak",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Current Policy Copy (from BMS), RC copy, Vehicle Invoice Copy, KYC documents (PAN and Aadhaar)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "Will raise the request and correction can be done post U/W Approval",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakPost Issuance Cancellation",
        "Insurer": "Kotak",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Policy period not started:\r\nNo requirement\r\n\r\nPolicy period started:\r\nAlternate Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "Kotak",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent & Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "KotakM-Parivahan",
        "Insurer": "Kotak",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "PAN and Masked Adhar card is required ( If CKYC not done)",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCAddition of GST No.",
        "Insurer": "HDFC",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCChassis Number",
        "Insurer": "HDFC",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCColour Change",
        "Insurer": "HDFC",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCEngine Number",
        "Insurer": "HDFC",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCHypothecation Remove",
        "Insurer": "HDFC",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC and NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCHypothecation Add",
        "Insurer": "HDFC",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCHypothecation Change",
        "Insurer": "HDFC",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC and NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCInsured name",
        "Insurer": "HDFC",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, Pehchaan ID, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": "Pehchan ID link: https://pehchaan.hdfcergo.com/"
    },
    {
        "InsurerRequirement": "HDFCNCB Certificate",
        "Insurer": "HDFC",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale Letter, PYP, NCB Confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCRegistration Date",
        "Insurer": "HDFC",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "NEW CAR POLICY ENDT: No charges or inspection required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCRegst. Number",
        "Insurer": "HDFC",
        "Requirement": "Regst. Number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "NEW CAR POLICY ENDT: No charges or inspection required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCRTO Endorsement",
        "Insurer": "HDFC",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCSeating Capacity",
        "Insurer": "HDFC",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCPeriod of Insurance (POI)",
        "Insurer": "HDFC",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCPYP Details- POI or Insurer or Policy number",
        "Insurer": "HDFC",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCTP details",
        "Insurer": "HDFC",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "TP Bundle Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCCommunication Address",
        "Insurer": "HDFC",
        "Requirement": "Communication Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Address Proof",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCDate of Birth (DOB)",
        "Insurer": "HDFC",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "DOB proof",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCEmail Address",
        "Insurer": "HDFC",
        "Requirement": "Email Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "New Mail ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCMobile Number",
        "Insurer": "HDFC",
        "Requirement": "Mobile Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "New Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCNominee Details",
        "Insurer": "HDFC",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCSalutation",
        "Insurer": "HDFC",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Customer Request",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCOwner Driver Personal Accident",
        "Insurer": "HDFC",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, DL and Nominee details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCPaid Driver",
        "Insurer": "HDFC",
        "Requirement": "Paid Driver",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "DL, 3 months Salary slip of driver.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCUn Named Passanger Cover",
        "Insurer": "HDFC",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Copy along with confirmation of 1Lac/2Lacs per seat coverage addition.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCCNG Addition External",
        "Insurer": "HDFC",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG Invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCCNG Addition Company fitted",
        "Insurer": "HDFC",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCCubic Capacity (CC)",
        "Insurer": "HDFC",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "HDFC",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCIDV Change",
        "Insurer": "HDFC",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCManufactured Date",
        "Insurer": "HDFC",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCMake, Model & Variant",
        "Insurer": "HDFC",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCOwnership Transfer",
        "Insurer": "HDFC",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PA Declaration form in pdf (available with ticketing team),pehchaan id, New owner details.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": "Pehchan ID link: https://pehchaan.hdfcergo.com/"
    },
    {
        "InsurerRequirement": "HDFCNCB Correction (taken extra NCB)",
        "Insurer": "HDFC",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCNCB Correction (taken less NCB)",
        "Insurer": "HDFC",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy,",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCTop Up (PAYD plan)",
        "Insurer": "HDFC",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "HDFC",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, PYP AND KYC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCPost Issuance Cancellation",
        "Insurer": "HDFC",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate and KYC Documents along with NEFT details (NEFT required in only in 2W policies)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "HDFC",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent & Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "HDFCM-Parivahan",
        "Insurer": "HDFC",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "No Requirement",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIAddition of GST No.",
        "Insurer": "ICICI",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIChassis Number",
        "Insurer": "ICICI",
        "Requirement": "Chassis Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIColour Change",
        "Insurer": "ICICI",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIEngine Number",
        "Insurer": "ICICI",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIHypothecation Remove",
        "Insurer": "ICICI",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIHypothecation Add",
        "Insurer": "ICICI",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Updated Rc or Loan Sanction Letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIHypothecation Change",
        "Insurer": "ICICI",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Updated Rc or Loan Sanction Letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIInsured name",
        "Insurer": "ICICI",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC,PYP, Aadhaar Card",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICINCB Certificate",
        "Insurer": "ICICI",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale Letter, PYP, NCB Confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIRegistration Date",
        "Insurer": "ICICI",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIRegst. Number",
        "Insurer": "ICICI",
        "Requirement": "Regst. Number",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIRTO Endorsement",
        "Insurer": "ICICI",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICISeating Capacity",
        "Insurer": "ICICI",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIPeriod of Insurance (POI)",
        "Insurer": "ICICI",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Previous Year Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIPYP Details- POI or Insurer or Policy number",
        "Insurer": "ICICI",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Previous Year Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICITP details",
        "Insurer": "ICICI",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Bundled TP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICICommunication Address",
        "Insurer": "ICICI",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Address with Pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIDate of Birth (DOB)",
        "Insurer": "ICICI",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "DOB proof",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIEmail Address",
        "Insurer": "ICICI",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Email Id",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIMobile Number",
        "Insurer": "ICICI",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Mobile number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICINominee Details",
        "Insurer": "ICICI",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICISalutation",
        "Insurer": "ICICI",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Customer Written Consent (By Mail or My Account)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIOwner Driver Personal Accident",
        "Insurer": "ICICI",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, DL and Nominee details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Addition possible only before policy start date (Post policy start date will suggest customer to take separate PA through ICICI website)\r\nCustomer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIPaid Driver",
        "Insurer": "ICICI",
        "Requirement": "Paid Driver",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "DL, 3 months Salary slip of driver",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Addition possible only before policy start date\r\nCustomer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIUn Named Passanger Cover",
        "Insurer": "ICICI",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Copy and Written consent from Customer along with confirmation of 1Lac/2Lacs per seat coverage addition.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Addition possible only before policy start date\r\nCustomer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICICNG Addition External",
        "Insurer": "ICICI",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG Invoice/PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICICNG Addition Company fitted",
        "Insurer": "ICICI",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICICubic Capacity (CC)",
        "Insurer": "ICICI",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "ICICI",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIIDV Change",
        "Insurer": "ICICI",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIManufactured Date",
        "Insurer": "ICICI",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIMake, Model & Variant",
        "Insurer": "ICICI",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIOwnership Transfer",
        "Insurer": "ICICI",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, Aadhaar Card and Pan Card (New owner), New owner details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent\r\n\r\nIf RC transfer process has been initiated in the RTO (From vehicle Transfer Date to 14 days):\r\nThen request could be processed using RTO receipt and without inspection",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICINCB Correction (taken extra NCB)",
        "Insurer": "ICICI",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy, NCB Confirmation letter from pyp insurer",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICINCB Correction (taken less NCB)",
        "Insurer": "ICICI",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy, NCB Confirmation letter from pyp insurer",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Yes",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICITop Up (PAYD plan)",
        "Insurer": "ICICI",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Customer Written Consent (By Mail or My Account)\r\nIf the initial purchase KM limit is exhausted, a complete inspection is required.\r\nIf not, an odometer photo must be collected from the customer while raising the request to the insurer.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "ICICI",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Reg. date and MMV needs to be correct, then only correction is possible - RC required & Customer Consent",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIPost Issuance Cancellation",
        "Insurer": "ICICI",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "No",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "ICICI",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent + RC & Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Customer request for endorsement mandatory - Please ask the customer to share written consent\r\nIf vehicle class is different, neither cancellation nor correction is possible",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "ICICIM-Parivahan",
        "Insurer": "ICICI",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC and written consent Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIAddition of GST No.",
        "Insurer": "SBI",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIChassis Number",
        "Insurer": "SBI",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIColour Change",
        "Insurer": "SBI",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIEngine Number",
        "Insurer": "SBI",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIHypothecation Remove",
        "Insurer": "SBI",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIHypothecation Add",
        "Insurer": "SBI",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIHypothecation Change",
        "Insurer": "SBI",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIInsured name",
        "Insurer": "SBI",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC with Owner serial no 1 and PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Incase of O.sno above 1 or pyp unavailibility - case to be considered as O/t",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBINCB Certificate",
        "Insurer": "SBI",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card, Sale Letter, PYP, NCB Confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIRegistration Date",
        "Insurer": "SBI",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIRegst. Number",
        "Insurer": "SBI",
        "Requirement": "Regst. Number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIRTO Endorsement",
        "Insurer": "SBI",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBISeating Capacity",
        "Insurer": "SBI",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIPeriod of Insurance (POI)",
        "Insurer": "SBI",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card along with Previous year policy copy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIPYP Details- POI or Insurer or Policy number",
        "Insurer": "SBI",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card along with Previous year policy copy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBITP details",
        "Insurer": "SBI",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card along with Bundled policy copy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBICommunication Address",
        "Insurer": "SBI",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Address with Pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIDate of Birth (DOB)",
        "Insurer": "SBI",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIEmail Address",
        "Insurer": "SBI",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Email Id",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIMobile Number",
        "Insurer": "SBI",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBINominee Details",
        "Insurer": "SBI",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBISalutation",
        "Insurer": "SBI",
        "Requirement": "Salutation",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Correct Salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIOwner Driver Personal Accident",
        "Insurer": "SBI",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIPaid Driver",
        "Insurer": "SBI",
        "Requirement": "Paid Driver",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIUn Named Passanger Cover",
        "Insurer": "SBI",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBICNG Addition External",
        "Insurer": "SBI",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card, RC, CNG Invoice or Pyp",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBICNG Addition Company fitted",
        "Insurer": "SBI",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card, RC and PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBICubic Capacity (CC)",
        "Insurer": "SBI",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "SBI",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIIDV Change",
        "Insurer": "SBI",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIManufactured Date",
        "Insurer": "SBI",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIMake, Model & Variant",
        "Insurer": "SBI",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card and RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIOwnership Transfer",
        "Insurer": "SBI",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PA Declaration (written confirmation if customer wants to add or not), Aadhaar Card and Pan Card (New owner), New owner details and Proposal Form (Available on MyAccount)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBINCB Correction (taken extra NCB)",
        "Insurer": "SBI",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Aadhaar and Pan Card, Previous Year Policy, NCB Confirmation letter from pyp insurer",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBINCB Correction (taken less NCB)",
        "Insurer": "SBI",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy, NCB Confirmation letter from pyp insurer",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBITop Up (PAYD plan)",
        "Insurer": "SBI",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "SBI",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIPost Issuance Cancellation",
        "Insurer": "SBI",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Aadhaar and Pan Card and Alternate policy",
        "TAT": "",
        "Charges / Deduction": "Deduction",
        "Inspection": "No",
        "Any Exception": "can only be canceled if the period of insurance (POI) of the alternate policy is exactly the same as the current policy\r\n\r\nThird Party cancellation - Can be cancelled on the basis of comprehensive with no POI condition",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "SBI",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent & Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "SBIM-Parivahan",
        "Insurer": "SBI",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "RC, Unmasked Aadhar and Pan card Required",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGAddition of GST No.",
        "Insurer": "TATA AIG",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGChassis Number",
        "Insurer": "TATA AIG",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGColour Change",
        "Insurer": "TATA AIG",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGEngine Number",
        "Insurer": "TATA AIG",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGHypothecation Remove",
        "Insurer": "TATA AIG",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGHypothecation Add",
        "Insurer": "TATA AIG",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGHypothecation Change",
        "Insurer": "TATA AIG",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGInsured name",
        "Insurer": "TATA AIG",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, Aadhaar & Pan card, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Proceed with O/t incase cx doesn't have PYP",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGNCB Certificate",
        "Insurer": "TATA AIG",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale Letter, PYP, NCB Confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGRegistration Date",
        "Insurer": "TATA AIG",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "NEW CAR POLICY ENDT: No charges or inspection required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGRegst. Number",
        "Insurer": "TATA AIG",
        "Requirement": "Regst. Number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "NEW CAR POLICY ENDT: No charges or inspection required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGRTO Endorsement",
        "Insurer": "TATA AIG",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGSeating Capacity",
        "Insurer": "TATA AIG",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGPeriod of Insurance (POI)",
        "Insurer": "TATA AIG",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGPYP Details- POI or Insurer or Policy number",
        "Insurer": "TATA AIG",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGTP details",
        "Insurer": "TATA AIG",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "TP Bundle Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGCommunication Address",
        "Insurer": "TATA AIG",
        "Requirement": "Communication Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Address Proof",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGDate of Birth (DOB)",
        "Insurer": "TATA AIG",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "DOB proof",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGEmail Address",
        "Insurer": "TATA AIG",
        "Requirement": "Email Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "New Mail ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGMobile Number",
        "Insurer": "TATA AIG",
        "Requirement": "Mobile Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "New Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGNominee Details",
        "Insurer": "TATA AIG",
        "Requirement": "Nominee Details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Nominee details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGSalutation",
        "Insurer": "TATA AIG",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Correct Salutation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGOwner Driver Personal Accident",
        "Insurer": "TATA AIG",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, DL and Nominee details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGPaid Driver",
        "Insurer": "TATA AIG",
        "Requirement": "Paid Driver",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "DL, 3 months Salary slip of driver.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGUn Named Passanger Cover",
        "Insurer": "TATA AIG",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC Copy along with confirmation of 1Lac/2Lacs per seat coverage addition.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGCNG Addition External",
        "Insurer": "TATA AIG",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG Invoice/PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGCNG Addition Company fitted",
        "Insurer": "TATA AIG",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGCubic Capacity (CC)",
        "Insurer": "TATA AIG",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "TATA AIG",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGIDV Change",
        "Insurer": "TATA AIG",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGManufactured Date",
        "Insurer": "TATA AIG",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGMake, Model & Variant",
        "Insurer": "TATA AIG",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGOwnership Transfer",
        "Insurer": "TATA AIG",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, Aadhaar Card and Pan Card (New owner), New owner details.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "If RC transfer process has been initiated in the RTO (From vehicle Transfer Date to 14 days):\r\n\r\nThen request could be processed using RTO receipt and without inspection",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGNCB Correction (taken extra NCB)",
        "Insurer": "TATA AIG",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy, NCB Confirmation letter from pyp insurer",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGNCB Correction (taken less NCB)",
        "Insurer": "TATA AIG",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy, NCB Confirmation letter from pyp insurer",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Yes",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGTop Up (PAYD plan)",
        "Insurer": "TATA AIG",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "TATA AIG",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGPost Issuance Cancellation",
        "Insurer": "TATA AIG",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "If Policy period has not started: Only customer request (Alternate policy not required)\r\n\r\nIf policy period has started:\r\nAlternate policy and Written consent from Customer\r\n\r\nSAOD policy cancellation:\r\nOnly customer request (even if policy period has started, alternate policy not required)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Full refund (If policy has not started)\r\nDeductions (if policy period has started)",
        "Inspection": "No",
        "Any Exception": "The request must be raised on WeCare before the policy start date with customer consent in order to process the cancellation without alternate",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "TATA AIG",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "",
        "Documents or any other requirement": "Customer consent & Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "",
        "Any Exception": "Only third Party policy cannot be cancelled\r\n\r\nFor comprehensive: TP (Third Party) amount will be retained, and the OD (Own Damage) part will be refunded based on the usage of the policy.",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "TATA AIGM-Parivahan",
        "Insurer": "TATA AIG",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "No requirement",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedAddition of GST No.",
        "Insurer": "United",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedChassis Number",
        "Insurer": "United",
        "Requirement": "Chassis Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedColour Change",
        "Insurer": "United",
        "Requirement": "Colour Change",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedEngine Number",
        "Insurer": "United",
        "Requirement": "Engine Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedHypothecation Remove",
        "Insurer": "United",
        "Requirement": "Hypothecation Remove",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC and NOC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedHypothecation Add",
        "Insurer": "United",
        "Requirement": "Hypothecation Add",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC and Loan letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedHypothecation Change",
        "Insurer": "United",
        "Requirement": "Hypothecation Change",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC and Loan letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedInsured name",
        "Insurer": "United",
        "Requirement": "Insured name",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC and PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedNCB Certificate",
        "Insurer": "United",
        "Requirement": "NCB Certificate",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Sale Letter, PYP, NCB Confirmation letter",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedRegistration Date",
        "Insurer": "United",
        "Requirement": "Registration Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date\r\nNEW CAR POLICY ENDT: No charges or inspection required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedRegst. Number",
        "Insurer": "United",
        "Requirement": "Regst. Number",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "Maybe",
        "Any Exception": "Correction possible after policy start date\r\nNEW CAR POLICY ENDT: No charges or inspection required",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedRTO Endorsement",
        "Insurer": "United",
        "Requirement": "RTO Endorsement",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedSeating Capacity",
        "Insurer": "United",
        "Requirement": "Seating Capacity",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedPeriod of Insurance (POI)",
        "Insurer": "United",
        "Requirement": "Period of Insurance (POI)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedPYP Details- POI or Insurer or Policy number",
        "Insurer": "United",
        "Requirement": "PYP Details- POI or Insurer or Policy number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedTP details",
        "Insurer": "United",
        "Requirement": "TP details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "TP Bundle Policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedCommunication Address",
        "Insurer": "United",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "New Address with pincode",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedDate of Birth (DOB)",
        "Insurer": "United",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "DOB proof",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedEmail Address",
        "Insurer": "United",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "New Mail ID",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedMobile Number",
        "Insurer": "United",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "New Mobile Number",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedNominee Details",
        "Insurer": "United",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedSalutation",
        "Insurer": "United",
        "Requirement": "Salutation",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Salutation details",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedOwner Driver Personal Accident",
        "Insurer": "United",
        "Requirement": "Owner Driver Personal Accident",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedPaid Driver",
        "Insurer": "United",
        "Requirement": "Paid Driver",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedUn Named Passanger Cover",
        "Insurer": "United",
        "Requirement": "Un Named Passanger Cover",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedCNG Addition External",
        "Insurer": "United",
        "Requirement": "CNG Addition External",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, CNG Invoice",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedCNG Addition Company fitted",
        "Insurer": "United",
        "Requirement": "CNG Addition Company fitted",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC, PYP",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedCubic Capacity (CC)",
        "Insurer": "United",
        "Requirement": "Cubic Capacity (CC)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedFuel Type (Petrol - Diesel, Diesel - petrol)",
        "Insurer": "United",
        "Requirement": "Fuel Type (Petrol - Diesel, Diesel - petrol)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedIDV Change",
        "Insurer": "United",
        "Requirement": "IDV Change",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedManufactured Date",
        "Insurer": "United",
        "Requirement": "Manufactured Date",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedMake, Model & Variant",
        "Insurer": "United",
        "Requirement": "Make, Model & Variant",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Maybe",
        "Inspection": "No",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedOwnership Transfer",
        "Insurer": "United",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "RC and New owner details.",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedNCB Correction (taken extra NCB)",
        "Insurer": "United",
        "Requirement": "NCB Correction (taken extra NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy, NCB Confirmation letter from pyp insurer",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Yes",
        "Inspection": "Yes",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedNCB Correction (taken less NCB)",
        "Insurer": "United",
        "Requirement": "NCB Correction (taken less NCB)",
        "Endorsement type": "Financial Endt",
        "Documents or any other requirement": "Previous Year Policy, NCB Confirmation letter from pyp insurer",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Refund",
        "Inspection": "Yes",
        "Any Exception": "Correction possible after policy start date",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedTop Up (PAYD plan)",
        "Insurer": "United",
        "Requirement": "Top Up (PAYD plan)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedMultiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Insurer": "United",
        "Requirement": "Multiple Mismatch (Reg no, chassis no & Engine no mismatch)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Only For Brand New Car\r\n After Policy Start Date (Undelivered Vehicles) - \r\n *ODO meter up to 50 km - Inspection Required, cancelled invoice, a signed/stamped dealer letterhead confirming the vehicle is still in the stockyard/Showroom.\r\n *ODO meter 51-100 km - Inspection Required, cancelled invoice, a signed/stamped dealer letterhead confirming the vehicle is still in the stockyard/Showroom, valid explanation from dealer on letter head for ODO more then 50 KM",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "Yes",
        "Any Exception": "Correction possible only if vehicle is not delivered",
        "Declaration format (if declaration required)": "A signed/stamped dealer letterhead confirming the vehicle is still in the stockyard/Showroom, valid explanation from dealer on letter head for ODO more then 50 KM"
    },
    {
        "InsurerRequirement": "UnitedPost Issuance Cancellation",
        "Insurer": "United",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "SAOD Policy Only\r\nPolicy period not started: Only Declaration Required\r\nPolicy period started: Only M-parivahan screen short required + Declaration Required\r\n\r\nFor Non Brand New Car - Alternate policy and Written Declaration from Customer (in the required format)\r\n For Brand New Car - Need to raise request within 72 hrs of policy issuance, Inspection Required, cancelled invoice, a signed/stamped dealer letterhead confirming the vehicle is still in the stockyard/Showroom.\r\n 1. Before policy starts - Cancelled with a minimum deduction of ₹118\r\n 2. After Policy Start Date (Undelivered Vehicles) - \r\n *ODO meter up to 50 km - All documents mentioned above + Cancelled with a minimum deduction of ₹118.\r\n *ODO meter 51-100 km - All documents mentioned above + valid explanation from dealer on letter head for ODO more then 50 KM - Cancelled with a minimum deduction of ₹118\r\n *ODO meter over 100 km - All documents mentioned above + plus consent from the insured for a \"No Claim\" declaration and approval for the premium deductions (1 Year TP + Prorata OD premium will be retain by United)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "Yes",
        "Any Exception": "Non brand New Car:\r\n Comprehensive policies can only be cancelled by Comprehensive/TP policy (Alternate insurer applicable, with policy same start date & time or before UIIC policy).\r\n SAOD policy cancellation: Alteranate bundle policy required\r\n TP cancellation: Alternate (comprehensive/TP) should be from UIIC",
        "Declaration format (if declaration required)": "Declaration for SAOD Policy - I/We hereby declare that Policy No. ___ for Vehicle No. ___ , covering the period from ___ to ___ , was purchased by me/us on ___ . Due to ______ , I/we request the cancellation of the above-mentioned Policy No. ___. I/we will not registered any claim in future\r\n\r\n\r\nDeclaration for TP & Comprihansive Policy - I request for cancellation of policy no. _____________________.\r\n I declare that my vehicle no: ___________ is not involved in any kind of TP Damage(Property/life) & no OD claim has been intimated under Policy No: _____________________ (of United India Insurance, purchased through policy bazaar )also i confirm that i will not take any claim under this policy & i will be liable for any third party claim within this policy.\r\n I declare that the alternate policy no. ____________________ is an active policy.\""
    },
    {
        "InsurerRequirement": "UnitedPost Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Insurer": "United",
        "Requirement": "Post Issuance Cancellation (Multiple Mismatch - Reg no, chassis no & Engine no mismatch",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "UnitedM-Parivahan",
        "Insurer": "United",
        "Requirement": "M-Parivahan",
        "Endorsement type": "NA",
        "Documents or any other requirement": "No requirement",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "",
        "Inspection": "",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - KotakInsured name",
        "Insurer": "CPA - Kotak",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, DL, Aadhaar & PAN",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - KotakCommunication Address",
        "Insurer": "CPA - Kotak",
        "Requirement": "Communication Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar, PAN & Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - KotakNominee Details",
        "Insurer": "CPA - Kotak",
        "Requirement": "Nominee Details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar & PAN of insured person & Nominee details (Name, DOB, Relation)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - KotakDate of Birth (DOB)",
        "Insurer": "CPA - Kotak",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar & PAN",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - KotakSalutation",
        "Insurer": "CPA - Kotak",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar & PAN",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - KotakMobile Number",
        "Insurer": "CPA - Kotak",
        "Requirement": "Mobile Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar & PAN",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - KotakEmail Address",
        "Insurer": "CPA - Kotak",
        "Requirement": "Email Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Aadhaar & PAN",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - KotakAddition of GST No.",
        "Insurer": "CPA - Kotak",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non-Financial Endorsement",
        "Documents or any other requirement": "GST Certificate in the name of Insured\r\nKYC Documents (Aadhaar Card and PAN Card)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - KotakOwnership Transfer",
        "Insurer": "CPA - Kotak",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - KotakVehicle Details",
        "Insurer": "CPA - Kotak",
        "Requirement": "Vehicle Details",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - KotakPost Issuance Cancellation",
        "Insurer": "CPA - Kotak",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Within Freelook period: Reason for cancellation & Aadhaar and PAN\r\nPost Free look period: Alternate policy & Reason for cancellation & Aadhaar and PAN",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "No",
        "Any Exception": "Provides freelook period of 15 Days from the policy start date, deductions are done post free look up period",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - CholaInsured name",
        "Insurer": "CPA - Chola",
        "Requirement": "Insured name",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC, DL & KYC (Masked Aadhaar / DL / Voter Card / Passport / PAN Card)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Only spelling mistake correction possible, complete name cannot be endorsed",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - CholaCommunication Address",
        "Insurer": "CPA - Chola",
        "Requirement": "Communication Address",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Masked Aadhaar / DL / Voter Card / Passport",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - CholaNominee Details",
        "Insurer": "CPA - Chola",
        "Requirement": "Nominee Details",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Nominee's KYC (Masked Aadhaar / DL / Voter Card / Passport / Pan) & Nominee details (Name, DOB, Relation)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - CholaDate of Birth (DOB)",
        "Insurer": "CPA - Chola",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Nominee's KYC (Masked Aadhaar / DL / Voter Card / Passport / Pan) & Correct DOB",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - CholaSalutation",
        "Insurer": "CPA - Chola",
        "Requirement": "Salutation",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Masked Aadhaar / DL / Voter Card / Passport / Pan",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - CholaMobile Number",
        "Insurer": "CPA - Chola",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - CholaEmail Address",
        "Insurer": "CPA - Chola",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - CholaAddition of GST No.",
        "Insurer": "CPA - Chola",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - CholaOwnership Transfer",
        "Insurer": "CPA - Chola",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - CholaVehicle Details",
        "Insurer": "CPA - Chola",
        "Requirement": "Vehicle Details",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - CholaPost Issuance Cancellation",
        "Insurer": "CPA - Chola",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - RelianceInsured name",
        "Insurer": "CPA - Reliance",
        "Requirement": "Insured name",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "RC, DL & KYC (Masked Aadhaar / DL / Voter Card / Passport / PAN Card) as per base policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - RelianceCommunication Address",
        "Insurer": "CPA - Reliance",
        "Requirement": "Communication Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - RelianceNominee Details",
        "Insurer": "CPA - Reliance",
        "Requirement": "Nominee Details",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Nominee details (Name, DOB, Relation) & Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - RelianceDate of Birth (DOB)",
        "Insurer": "CPA - Reliance",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Self Endt",
        "Documents or any other requirement": "Nominee's KYC (Masked Aadhaar / DL / Voter Card / Passport / Pan) & Correct DOB",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - RelianceSalutation",
        "Insurer": "CPA - Reliance",
        "Requirement": "Salutation",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - RelianceMobile Number",
        "Insurer": "CPA - Reliance",
        "Requirement": "Mobile Number",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - RelianceEmail Address",
        "Insurer": "CPA - Reliance",
        "Requirement": "Email Address",
        "Endorsement type": "Nil Endt",
        "Documents or any other requirement": "Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - RelianceAddition of GST No.",
        "Insurer": "CPA - Reliance",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - RelianceOwnership Transfer",
        "Insurer": "CPA - Reliance",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - RelianceVehicle Details",
        "Insurer": "CPA - Reliance",
        "Requirement": "Vehicle Details",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - ReliancePost Issuance Cancellation",
        "Insurer": "CPA - Reliance",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "No",
        "Any Exception": "Provides freelook period of 30 Days from the policy start date, deductions are done post free look up period",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - BajajInsured name",
        "Insurer": "CPA - Bajaj",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, DL & KYC (Masked Aadhaar / DL / Voter Card / Passport / PAN Card) as per base policy",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - BajajCommunication Address",
        "Insurer": "CPA - Bajaj",
        "Requirement": "Communication Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - BajajNominee Details",
        "Insurer": "CPA - Bajaj",
        "Requirement": "Nominee Details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Nominee details (Name, DOB, Relation) & Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - BajajDate of Birth (DOB)",
        "Insurer": "CPA - Bajaj",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Correct DOB - Customer's consent / Written consent",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - BajajSalutation",
        "Insurer": "CPA - Bajaj",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - BajajMobile Number",
        "Insurer": "CPA - Bajaj",
        "Requirement": "Mobile Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - BajajEmail Address",
        "Insurer": "CPA - Bajaj",
        "Requirement": "Email Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Consent via App/Email/Call - Remarks on BMS",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - BajajAddition of GST No.",
        "Insurer": "CPA - Bajaj",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non-Financial Endorsement",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - BajajOwnership Transfer",
        "Insurer": "CPA - Bajaj",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - BajajVehicle Details",
        "Insurer": "CPA - Bajaj",
        "Requirement": "Vehicle Details",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - BajajPost Issuance Cancellation",
        "Insurer": "CPA - Bajaj",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Reason for cancellation (like don’t have DL / don’t drive etc.),& Alternate policy (if customer has an alternate policy)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "No",
        "Any Exception": "Provides freelook period of 15 Days from the policy start date, deductions are done post free look up period",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - DigitInsured name",
        "Insurer": "CPA - Digit",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, DL & Written Consent via App/Email & Nominee’s DOB",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "Only spelling mistake correction possible, complete name cannot be endorsed",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - DigitCommunication Address",
        "Insurer": "CPA - Digit",
        "Requirement": "Communication Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Written Consent via App/Email & Nominee’s DOB",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - DigitNominee Details",
        "Insurer": "CPA - Digit",
        "Requirement": "Nominee Details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Written Consent via App/Email & Nominee Details (Name, DOB & Relation)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - DigitDate of Birth (DOB)",
        "Insurer": "CPA - Digit",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Written Consent via App/Email & Nominee’s DOB",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - DigitSalutation",
        "Insurer": "CPA - Digit",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Written Consent via App/Email & Nominee’s DOB",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - DigitMobile Number",
        "Insurer": "CPA - Digit",
        "Requirement": "Mobile Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Written Consent via App/Email & Nominee’s DOB",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - DigitEmail Address",
        "Insurer": "CPA - Digit",
        "Requirement": "Email Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Written Consent via App/Email & Nominee’s DOB",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - DigitAddition of GST No.",
        "Insurer": "CPA - Digit",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non-Financial Endorsement",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - DigitOwnership Transfer",
        "Insurer": "CPA - Digit",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - DigitVehicle Details",
        "Insurer": "CPA - Digit",
        "Requirement": "Vehicle Details",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - DigitPost Issuance Cancellation",
        "Insurer": "CPA - Digit",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "",
        "Documents or any other requirement": "Alternate policy & Reason for cancellation",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "Deduction",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - LibertyInsured name",
        "Insurer": "CPA - Liberty",
        "Requirement": "Insured name",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "RC, DL, KYC & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - LibertyCommunication Address",
        "Insurer": "CPA - Liberty",
        "Requirement": "Communication Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Address Proof (KYC Doc) and Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - LibertyNominee Details",
        "Insurer": "CPA - Liberty",
        "Requirement": "Nominee Details",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Nominee Details (Name, DOB & Relation and Nominee’s KYC docs.) & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - LibertyDate of Birth (DOB)",
        "Insurer": "CPA - Liberty",
        "Requirement": "Date of Birth (DOB)",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - LibertySalutation",
        "Insurer": "CPA - Liberty",
        "Requirement": "Salutation",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Written Consent via App/Email, KYC Docs  & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - LibertyMobile Number",
        "Insurer": "CPA - Liberty",
        "Requirement": "Mobile Number",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Written Consent via App/Email, KYC Docs  & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - LibertyEmail Address",
        "Insurer": "CPA - Liberty",
        "Requirement": "Email Address",
        "Endorsement type": "Non Financial Endt",
        "Documents or any other requirement": "Written Consent via App/Email, KYC Docs  & Endorsement form (will be provided by TL / ticketing team)",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "For Ticket associate: Endorsement form to be filled and raised to insurer",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - LibertyAddition of GST No.",
        "Insurer": "CPA - Liberty",
        "Requirement": "Addition of GST No.",
        "Endorsement type": "Non-Financial Endorsement",
        "Documents or any other requirement": "GST Certificate in the name of Insured",
        "TAT": "SRS / 10 Days",
        "Charges / Deduction": "No",
        "Inspection": "No",
        "Any Exception": "",
        "Declaration format (if declaration required)": ""
    },
    {
        "InsurerRequirement": "CPA - LibertyOwnership Transfer",
        "Insurer": "CPA - Liberty",
        "Requirement": "Ownership Transfer",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - LibertyVehicle Details",
        "Insurer": "CPA - Liberty",
        "Requirement": "Vehicle Details",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": "Not Possible"
    },
    {
        "InsurerRequirement": "CPA - LibertyPost Issuance Cancellation",
        "Insurer": "CPA - Liberty",
        "Requirement": "Post Issuance Cancellation",
        "Endorsement type": "Not Possible",
        "Documents or any other requirement": "Not Possible",
        "TAT": "Not Possible",
        "Charges / Deduction": "Not Possible",
        "Inspection": "Not Possible",
        "Any Exception": "Not Possible",
        "Declaration format (if declaration required)": ""
    }
];
// Populate insurer dropdown for Endorsement
try {
    const insurers = [...new Set(endorsementData.map(d => d["Insurer"]))].sort();
    insurers.forEach(ins => {
        const opt = document.createElement("option");
        opt.value = opt.textContent = ins;
        insurerDropdown.appendChild(opt);
    });
} catch (error) {
    console.error("Error populating insurers for endorsement:", error);
    showMessage("Error in endorsement JSON data. Please check the syntax and paste valid JSON.", "error");
}

// Handle insurer selection for endorsement
insurerDropdown.addEventListener("change", () => {
    requirementDropdown.innerHTML = "<option disabled selected>Select Requirement</option>";
    outputBox.style.display = "none";
    outputBox.classList.remove("show", "output-red");
    const selectedInsurer = insurerDropdown.value;
    const requirements = [...new Set(
        endorsementData.filter(d => d["Insurer"] === selectedInsurer)
            .map(d => d["Requirement"])
    )].sort();
    requirements.forEach(req => {
        const opt = document.createElement("option");
        opt.value = opt.textContent = req;
        requirementDropdown.appendChild(opt);
    });
    requirementDropdown.disabled = false;
});

// Handle requirement selection for endorsement
function escapeEndorsementHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const defaultEndorsementFormatRule = {
    plain: false,
    markers: [
        "For Non Brand New Car -",
        "For Brand New Car -",
        "1. Before policy starts -",
        "2. After Policy Start Date (Undelivered Vehicles) -",
        "*ODO meter up to 50 km -",
        "*ODO meter 51-100 km -",
        "*ODO meter over 100 km -",
        "Non brand New Car:",
        "SAOD policy cancellation:",
        "TP cancellation:"
    ]
};

// Special point rules: old Excel-to-JSON process same rakho; sirf tricky cases yahan add karo.
// Key format: "Insurer|Requirement", then label name like "Documents Required:" or "Exception:".
const endorsementFormatRules = {
    "United|Post Issuance Cancellation": {
        "Documents Required:": {
            markers: [
                "For Non Brand New Car -",
                "For Brand New Car -",
                "1. Before policy starts -",
                "2. After Policy Start Date (Undelivered Vehicles) -",
                "*ODO meter up to 50 km -",
                "*ODO meter 51-100 km -",
                "*ODO meter over 100 km -"
            ]
        },
        "Exception:": {
            markers: [
                "Non brand New Car:",
                "SAOD policy cancellation:",
                "TP cancellation:"
            ]
        },
        // Agar exact custom points chahiye ho, markers ke badle points use kar sakte ho:
        // "Exception:": { points: ["Point 1", "Point 2", "* Sub point"] },
        "Declaration Format:": {
            plain: true
        }
    }
};

function getEndorsementFormatRule(record, label) {
    if (label === "Declaration Format:") return { plain: true, markers: [] };

    const ruleKey = `${record?.["Insurer"] || ""}|${record?.["Requirement"] || ""}`;
    const specialRule = endorsementFormatRules[ruleKey]?.[label];
    if (specialRule) {
        return {
            ...defaultEndorsementFormatRule,
            ...specialRule
        };
    }

    return defaultEndorsementFormatRule;
}

function renderEndorsementPointLines(lines) {
    return `<span class="endorsement-formatted-value">
        ${lines.map((line, lineIndex) => {
        const isSubPoint = line.startsWith("*");
        const isNumberedPoint = /^\d+\./.test(line);
        const displayLine = isSubPoint
            ? line.replace(/^\*/, "* ")
            : isNumberedPoint
                ? line
                : `* ${line}`;
        return `<span class="endorsement-formatted-line ${isSubPoint ? "endorsement-sub-point" : ""}" data-point-index="${lineIndex % 4}">${escapeEndorsementHtml(displayLine)}</span>`;
    }).join("")}
    </span>`;
}

function mergeEndorsementHeadingLines(lines) {
    const merged = [];
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const nextLine = lines[index + 1];
        const canMergeWithNext = /:$/.test(line)
            && nextLine
            && !/^([*\d]|For\s+)/i.test(nextLine)
            && !/:$/.test(nextLine);

        if (canMergeWithNext) {
            merged.push(`${line} ${nextLine}`);
            index++;
        } else {
            merged.push(line);
        }
    }
    return merged;
}

function getFormattedEndorsementValue(value, label, record) {
    const rawText = String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
    if (!rawText) return "";
    const rule = getEndorsementFormatRule(record, label);
    if (rule.plain) {
        return `<span class="endorsement-plain-value">${escapeEndorsementHtml(rawText)}</span>`;
    }
    if (Array.isArray(rule.points) && rule.points.length) {
        return renderEndorsementPointLines(rule.points.map(point => String(point || "").trim()).filter(Boolean));
    }

    let formatted = rawText.replace(/[ \t]+/g, " ");
    (rule.markers || []).forEach(marker => {
        formatted = formatted.replaceAll(marker, `\n${marker}`);
    });

    const lines = mergeEndorsementHeadingLines(formatted
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean));
    if (lines.length <= 1) {
        return `<span class="endorsement-plain-value">${escapeEndorsementHtml(rawText)}</span>`;
    }

    return renderEndorsementPointLines(lines);
}
function getEndorsementChecklistHtml(record, checklistItems) {
    return checklistItems.map(([label, value], index) => `
        <label class="endorsement-check-row ${label.includes("Keep endorsement") ? "endorsement-reminder-row" : ""}">
            <input class="endorsement-check" type="checkbox" aria-label="${escapeEndorsementHtml(label)} checked" data-check-index="${index}">
            <span class="endorsement-check-content">
                <span class="label">${escapeEndorsementHtml(label)}</span><span class="value">${getFormattedEndorsementValue(value, label, record)}</span>
            </span>
        </label>
    `).join("");
}

function getEndorsementSourceRows(record, options = {}) {
    const includeClaimConfirmation = Boolean(options.includeClaimConfirmation);
    const includePolicyCopyReminder = Boolean(options.includePolicyCopyReminder);
    const rows = [
        ["Endorsement Type:", record["Endorsement type"]],
        ["Documents Required:", record["Documents or any other requirement"]],
        ["TAT:", record["TAT"]],
        ["Charges/Deduction:", record["Charges / Deduction"]],
        ["Inspection:", record["Inspection"]],
        ["Exception:", record["Any Exception"]],
        ["Declaration Format:", record["Declaration format (if declaration required)"]]
    ];

    if (includeClaimConfirmation) {
        rows.unshift(["claim confirmation", ""]);
    }
    if (includePolicyCopyReminder) {
        rows.push(["Keep endorsement and policy copy together:", ""]);
    }

    return rows;
}

const unitedCancellationGuide = {
    brandNew: {
        title: "Brand New Vehicle",
        question: "Select the exact policy condition:",
        options: [
            {
                value: "beforeStart",
                label: "Before Policy Starts",
                rows: [
                    ["Documents Required:", "Need to raise request within 72 hrs of policy issuance, Inspection Required, cancelled invoice, a signed/stamped dealer letterhead confirming the vehicle is still in the stockyard/Showroom."],
                    ["Cancellation Rule:", "Cancelled with a minimum deduction of Rs. 118."]
                ]
            },
            {
                value: "odo50",
                label: "After Start: ODO up to 50 km",
                rows: [
                    ["Documents Required:", "Need to raise request within 72 hrs of policy issuance, Inspection Required, cancelled invoice, a signed/stamped dealer letterhead confirming the vehicle is still in the stockyard/Showroom."],
                    ["Cancellation Rule:", "All documents mentioned above + cancelled with a minimum deduction of Rs. 118."]
                ]
            },
            {
                value: "odo100",
                label: "After Start: ODO 51-100 km",
                rows: [
                    ["Documents Required:", "Need to raise request within 72 hrs of policy issuance, Inspection Required, cancelled invoice, a signed/stamped dealer letterhead confirming the vehicle is still in the stockyard/Showroom, valid explanation from dealer on letterhead for ODO more than 50 km."],
                    ["Cancellation Rule:", "Cancelled with a minimum deduction of Rs. 118."]
                ]
            },
            {
                value: "odoAbove100",
                label: "After Start: ODO over 100 km",
                rows: [
                    ["Documents Required:", "Need to raise request within 72 hrs of policy issuance, Inspection Required, cancelled invoice, a signed/stamped dealer letterhead confirming the vehicle is still in the stockyard/Showroom, consent from the insured for a No Claim declaration, and approval for premium deductions."],
                    ["Cancellation Rule:", "1 Year TP + prorata OD premium will be retained by United."]
                ]
            }
        ]
    },
    nonBrandNew: {
        title: "Non Brand New Vehicle",
        question: "Select the policy type:",
        options: [
            {
                value: "comprehensive",
                label: "Comprehensive",
                rows: [
                    ["Documents Required:", "Alternate policy and Written Declaration from Customer in the required format."],
                    ["Exception:", "Comprehensive policies can only be cancelled by Comprehensive/TP policy. Alternate insurer applicable, with policy same start date and time or before UIIC policy."],
                    ["Declaration Format:", null]
                ]
            },
            {
                value: "saod",
                label: "SAOD",
                rows: [
                    ["Documents Required:", "Alternate policy and Written Declaration from Customer in the required format."],
                    ["Exception:", "SAOD policy cancellation: Alternate bundle policy required."],
                    ["Declaration Format:", null]
                ]
            },
            {
                value: "tp",
                label: "TP",
                rows: [
                    ["Documents Required:", "Alternate policy and Written Declaration from Customer in the required format."],
                    ["Exception:", "TP cancellation: Alternate Comprehensive/TP should be from UIIC."],
                    ["Declaration Format:", null]
                ]
            }
        ]
    }
};

const tataAigCancellationGuide = {
    title: "TATA AIG Post Issuance Cancellation",
    question: "Select the exact cancellation case:",
    options: [
        {
            value: "policyNotStarted",
            label: "Policy Period Not Started",
            rows: [
                ["Documents Required:", "Only customer request is required. Alternate policy is not required."],
                ["Charges/Deduction:", "Full refund. No deduction."],
                ["Exception:", "Request must be raised on WeCare before the policy start date with customer consent to process cancellation without alternate policy."]
            ]
        },
        {
            value: "policyStarted",
            label: "Policy Period Started",
            rows: [
                ["Documents Required:", "Alternate policy and written consent from customer are required."],
                ["Charges/Deduction:", "Deduction will apply because the policy period has started."]
            ]
        },
        {
            value: "saod",
            label: "SAOD Cancellation",
            rows: [
                ["Documents Required:", "Only customer request is required."],
                ["Charges/Deduction:", "Full refund if policy has not started. Deduction will apply if policy period has started."],
                ["Cancellation Rule:", "Alternate policy is not required, even if the policy period has started."]
            ]
        }
    ]
};

function getCancellationCommonRows(record) {
    const rows = [
        ["claim confirmation", ""],
        ["TAT:", record["TAT"]],
        ["Charges/Deduction:", record["Charges / Deduction"]],
        ["Inspection:", record["Inspection"]]
    ];
    if (String(record["Endorsement type"] || "").trim()) {
        rows.splice(1, 0, ["Endorsement Type:", record["Endorsement type"]]);
    }
    return rows;
}

function getUnitedCancellationCommonRows(record) {
    return getCancellationCommonRows(record);
}

function hasAllKeywords(text, keywords) {
    const normalizedText = String(text || "").toLowerCase();
    return keywords.every(keyword => normalizedText.includes(String(keyword || "").toLowerCase()));
}

function shouldUseUnitedCancellationGuide(record) {
    return hasAllKeywords(record?.["Documents or any other requirement"], [
        "For Non Brand New Car",
        "For Brand New Car",
        "ODO meter up to 50 km",
        "ODO meter 51-100 km",
        "ODO meter over 100 km"
    ]) && hasAllKeywords(record?.["Any Exception"], [
        "Non brand New Car",
        "SAOD policy cancellation",
        "TP cancellation"
    ]);
}

function shouldUseTataAigCancellationGuide(record) {
    return hasAllKeywords(record?.["Documents or any other requirement"], [
        "If Policy period has not started",
        "If policy period has started",
        "SAOD policy cancellation"
    ]) && hasAllKeywords(record?.["Charges / Deduction"], [
        "Full refund",
        "Deductions"
    ]);
}

function mentionsPolicyPlan(value) {
    return /\b(TP|SAOD|Comprehensive)\b/i.test(String(value || ""));
}

function normalizeEndorsementValue(value) {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
}

function getComparableEndorsementValue(value) {
    return normalizeEndorsementValue(value)
        .toLowerCase()
        .replace(/\b(the|in order to|to)\b/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function hasEquivalentEndorsementValue(firstValue, secondValue) {
    const first = getComparableEndorsementValue(firstValue);
    const second = getComparableEndorsementValue(secondValue);
    if (!first || !second) return false;
    return first === second || first.includes(second) || second.includes(first);
}

function getPlanIndependentSourceRows(record, existingRows = []) {
    const sourceRows = [
        ["Documents Required:", record?.["Documents or any other requirement"]],
        ["Exception:", record?.["Any Exception"]],
        ["Declaration Format:", record?.["Declaration format (if declaration required)"]]
    ];

    return sourceRows.filter(([label, value]) => {
        const normalizedValue = normalizeEndorsementValue(value);
        if (!normalizedValue || mentionsPolicyPlan(normalizedValue)) return false;

        return !existingRows.some(([existingLabel, existingValue]) =>
            String(existingLabel || "").trim().toLowerCase() === String(label || "").trim().toLowerCase()
            && hasEquivalentEndorsementValue(existingValue, normalizedValue)
        );
    }).map(([label, value]) => [label, normalizeEndorsementValue(value)]);
}
function getUnitedSaodPolicyOnlyRows(record) {
    const docs = String(record?.["Documents or any other requirement"] || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
    const lines = docs.split("\n").map(line => line.trim());
    const startIndex = lines.findIndex(line => /^SAOD Policy Only$/i.test(line));
    if (startIndex < 0) return [];

    const policyLines = [];
    for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) break;
        if (/^For\s+/i.test(line)) break;
        policyLines.push(line);
    }

    return policyLines.length ? [["SAOD Policy Only:", policyLines.join("\n")]] : [];
}

function getUnitedSelectedRows(record, selectedVehicleType, selectedOption) {
    const rows = selectedOption.rows.map(([label, value]) => [
        label,
        value === null ? record["Declaration format (if declaration required)"] : value
    ]);

    if (selectedVehicleType === "nonBrandNew" && selectedOption.value === "saod") {
        return [
            ...getUnitedSaodPolicyOnlyRows(record),
            ...rows
        ];
    }

    return rows;
}
function renderUnitedCancellationGuide(record, selectedVehicleType = "", selectedCondition = "") {
    const vehicleOptions = [
        ["brandNew", unitedCancellationGuide.brandNew.title],
        ["nonBrandNew", unitedCancellationGuide.nonBrandNew.title]
    ];
    const selectedGuide = unitedCancellationGuide[selectedVehicleType];
    const selectedOption = selectedGuide?.options.find(option => option.value === selectedCondition);

    if (selectedOption) {
        const conditionRows = getUnitedSelectedRows(record, selectedVehicleType, selectedOption);
        const checklistItems = [
            ["Selected Condition:", `${selectedGuide.title} - ${selectedOption.label}`],
            ...getCancellationCommonRows(record),
            ...conditionRows,
            ...getPlanIndependentSourceRows(record, conditionRows)
        ];

        outputBox.innerHTML = `
            <div class="united-cancel-guide">
                <div class="united-guide-actions">
                    <button type="button" class="united-cancel-back" data-united-step="vehicle">Change Vehicle Type</button>
                    <button type="button" class="united-cancel-back" data-united-step="condition" data-vehicle-type="${escapeEndorsementHtml(selectedVehicleType)}">Change Condition</button>
                </div>
                ${getEndorsementChecklistHtml(record, checklistItems)}
            </div>
        `;
        return;
    }

    if (selectedGuide) {
        outputBox.innerHTML = `
            <div class="united-cancel-guide">
                <div class="united-guide-title">${escapeEndorsementHtml(selectedGuide.title)}</div>
                <div class="united-guide-question">${escapeEndorsementHtml(selectedGuide.question)}</div>
                <div class="united-guide-options">
                    ${selectedGuide.options.map(option => `
                        <button type="button" class="united-cancel-option" data-united-step="condition" data-vehicle-type="${escapeEndorsementHtml(selectedVehicleType)}" data-condition="${escapeEndorsementHtml(option.value)}">${escapeEndorsementHtml(option.label)}</button>
                    `).join("")}
                </div>
                <button type="button" class="united-cancel-back" data-united-step="vehicle">Back</button>
            </div>
        `;
        return;
    }

    outputBox.innerHTML = `
        <div class="united-cancel-guide">
            <div class="united-guide-title">United Post Issuance Cancellation</div>
            <div class="united-guide-question">Select the vehicle type:</div>
            <div class="united-guide-options">
                ${vehicleOptions.map(([value, label]) => `
                    <button type="button" class="united-cancel-option" data-united-step="vehicle" data-vehicle-type="${escapeEndorsementHtml(value)}">${escapeEndorsementHtml(label)}</button>
                `).join("")}
            </div>
        </div>
    `;
}

function renderTataAigCancellationGuide(record, selectedCondition = "") {
    const selectedOption = tataAigCancellationGuide.options.find(option => option.value === selectedCondition);

    if (selectedOption) {
        const commonRows = getCancellationCommonRows(record)
            .filter(([label]) => label !== "Charges/Deduction:");
        const checklistItems = [
            ["Selected Condition:", selectedOption.label],
            ...commonRows,
            ...selectedOption.rows,
            ...getPlanIndependentSourceRows(record, selectedOption.rows)
        ];

        outputBox.innerHTML = `
            <div class="united-cancel-guide">
                <div class="united-guide-actions">
                    <button type="button" class="united-cancel-back tata-cancel-back" data-tata-step="condition">Change Condition</button>
                </div>
                ${getEndorsementChecklistHtml(record, checklistItems)}
            </div>
        `;
        return;
    }

    outputBox.innerHTML = `
        <div class="united-cancel-guide">
            <div class="united-guide-title">${escapeEndorsementHtml(tataAigCancellationGuide.title)}</div>
            <div class="united-guide-question">${escapeEndorsementHtml(tataAigCancellationGuide.question)}</div>
            <div class="united-guide-options">
                ${tataAigCancellationGuide.options.map(option => `
                    <button type="button" class="united-cancel-option tata-cancel-option" data-tata-step="condition" data-condition="${escapeEndorsementHtml(option.value)}">${escapeEndorsementHtml(option.label)}</button>
                `).join("")}
            </div>
        </div>
    `;
}
outputBox.addEventListener("click", event => {
    const optionButton = event.target.closest(".united-cancel-option, .united-cancel-back, .tata-cancel-option, .tata-cancel-back");
    if (!optionButton) return;

    if (optionButton.dataset.tataStep) {
        const tataRecord = endorsementData.find(
            d => d["Insurer"] === "TATA AIG" && d["Requirement"] === "Post Issuance Cancellation"
        );
        if (!tataRecord || !shouldUseTataAigCancellationGuide(tataRecord)) return;
        renderTataAigCancellationGuide(tataRecord, optionButton.dataset.condition || "");
        return;
    }

    const unitedRecord = endorsementData.find(
        d => d["Insurer"] === "United" && d["Requirement"] === "Post Issuance Cancellation"
    );
    if (!unitedRecord || !shouldUseUnitedCancellationGuide(unitedRecord)) return;

    const step = optionButton.dataset.unitedStep;
    if (step === "vehicle") {
        renderUnitedCancellationGuide(unitedRecord, optionButton.dataset.vehicleType || "", "");
        return;
    }
    if (step === "condition") {
        renderUnitedCancellationGuide(unitedRecord, optionButton.dataset.vehicleType || "", optionButton.dataset.condition || "");
    }
});

requirementDropdown.addEventListener("change", () => {
    const ins = insurerDropdown.value;
    const req = requirementDropdown.value;
    const record = endorsementData.find(
        d => d["Insurer"] === ins && d["Requirement"] === req
    );
    if (record) {
        if (ins === "United" && req === "Post Issuance Cancellation" && shouldUseUnitedCancellationGuide(record)) {
            renderUnitedCancellationGuide(record);
            outputBox.classList.remove("output-red");
            outputBox.style.display = "block";
            outputBox.scrollTop = 0;
            document.getElementById("endorsementPage").scrollTop = 0;
            setTimeout(() => outputBox.classList.add("show"), 10);
            return;
        }
        if (ins === "TATA AIG" && req === "Post Issuance Cancellation" && shouldUseTataAigCancellationGuide(record)) {
            renderTataAigCancellationGuide(record);
            outputBox.classList.remove("output-red");
            outputBox.style.display = "block";
            outputBox.scrollTop = 0;
            document.getElementById("endorsementPage").scrollTop = 0;
            setTimeout(() => outputBox.classList.add("show"), 10);
            return;
        }

        const hidePolicyCopyReminder = req.includes("Post Issuance Cancellation") || req === "M-Parivahan";
        const checklistItems = getEndorsementSourceRows(record, {
            includeClaimConfirmation: req.includes("Post Issuance Cancellation"),
            includePolicyCopyReminder: !hidePolicyCopyReminder
        });
        outputBox.innerHTML = `
            ${getEndorsementChecklistHtml(record, checklistItems)}
          `;
        if (record["Endorsement type"].toLowerCase() === "not possible") {
            outputBox.classList.add("output-red");
        } else {
            outputBox.classList.remove("output-red");
        }
        outputBox.style.display = "block";
        outputBox.scrollTop = 0;
        document.getElementById("endorsementPage").scrollTop = 0;
        setTimeout(() => outputBox.classList.add("show"), 10);
    }
});

// Insurance Comparison Dashboard Data and Logic (from index (4).html)
const insuranceData = [
    {
        "insurer_name": "RSGI",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "Unlimited",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "No"
    },
    {
        "insurer_name": "SBI",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "2",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "No"
    },
    {
        "insurer_name": "UNIVERSAL SOMPO",
        "video_approval": "At U/W end",
        "video_tat": "2 days",
        "short_partial": "No",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Will Refer to Under Writer",
        "zd_claims_year": "Unlimited",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "No"
    },
    {
        "insurer_name": "FUTURE GENERALI",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "2",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "No"
    },
    {
        "insurer_name": "BAJAJ",
        "video_approval": "At U/W end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Will Refer to Under Writer",
        "zd_claims_year": "2",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "Yes"
    },
    {
        "insurer_name": "RELIANCE",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required (with vehicle number) within Video TAT",
        "zd_claims_year": "2",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "Yes"
    },
    {
        "insurer_name": "IFFCO",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "Unlimited",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "No"
    },
    {
        "insurer_name": "MAGMA",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required (Scar on Driver Side we will not accept) within Video TAT",
        "zd_claims_year": "Unlimited",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "No"
    },
    {
        "insurer_name": "Oriental Insurance",
        "video_approval": "At PB end",
        "video_tat": "24 Hours",
        "short_partial": "No",
        "cng_kit_vi": "Yes",
        "artificial_low_lighting": "Yes",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "2",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "Yes"
    },
    {
        "insurer_name": "United India",
        "video_approval": "At PB end",
        "video_tat": "48 Hours",
        "short_partial": "Yes",
        "cng_kit_vi": "Yes",
        "artificial_low_lighting": "Yes",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "Unlimited",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "Yes"
    },
    {
        "insurer_name": "NIA",
        "video_approval": "At PB end",
        "video_tat": "24 Hours",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "2",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "Yes",
        "old_3_3": "No",
        "vas": "No"
    },
    {
        "insurer_name": "NIA 3+3",
        "video_approval": "At PB end",
        "video_tat": "24 Hours",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "Unlimited",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "Yes",
        "old_3_3": "No",
        "vas": "No"
    },
    {
        "insurer_name": "National Insurance",
        "video_approval": "At PB end",
        "video_tat": "24 Hours",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "2",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "Yes"
    },
    {
        "insurer_name": "Shriram General",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required (In Shriram format)+Address ID proof within Video TAT<br>Declaration required if Air Bag indicator is on at engine start",
        "zd_claims_year": "2",
        "non_zd_claims_year": "3",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "Yes"
    },
    {
        "insurer_name": "Kotak General",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "2",
        "non_zd_claims_year": "Unlimited but cashless is limited to 2",
        "brand_new_3_3": "Yes",
        "old_3_3": "No",
        "vas": "Yes"
    },
    {
        "insurer_name": "Liberty Videocon",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "No",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Will Not Accept Scar on WS/change insurer",
        "zd_claims_year": "Unlimited",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "No"
    },
    {
        "insurer_name": "Raheja QBE",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "Unlimited",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "No"
    },
    {
        "insurer_name": "ZUNO",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "2",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "Yes"
    },
    {
        "insurer_name": "Digit General",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "Unlimited ZD claims only on brand-new cars. For a non-brand-new car, the claim count will be mentioned in the policy PDF.",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "Yes",
        "old_3_3": "Yes",
        "vas": "No"
    },
    {
        "insurer_name": "Cholamandalam MS",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Will Not Accept Scar on WS/change insurer",
        "zd_claims_year": "2",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No",
        "vas": "No"
    },
    {
        "insurer_name": "HDFC Ergo",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "No",
        "scar_declaration": "Will Not Accept Scar on WS/change insurer",
        "zd_claims_year": "Unlimited",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "Yes",
        "old_3_3": "No",
        "vas": "No"
    },
    {
        "insurer_name": "ICICI Lombard",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "Yes",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "Unlimited ZD claim only to these makers: Maruti, Hyundai, Honda, Toyota, Kia, MG, Volvo, Ford. Rest of the makers have only 2 ZD claims.",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "Yes",
        "old_3_3": "Yes",
        "vas": "Yes"
    },
    {
        "insurer_name": "ICICI 3+3",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "No",
        "artificial_low_lighting": "Yes",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "6",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "Yes",
        "old_3_3": "Yes",
        "vas": "Yes"
    },
    {
        "insurer_name": "TATA AIG",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "Yes",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required (with vehicle number) within Video TAT",
        "zd_claims_year": "2",
        "non_zd_claims_year": "99",
        "brand_new_3_3": "Yes",
        "old_3_3": "Yes",
        "vas": "No"
    },
    {
        "insurer_name": "TATA AIG 3+3 Plan",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "Yes",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required (with vehicle number) within Video TAT",
        "zd_claims_year": "5 ZD Claims Overall, Maximum 2 in a year",
        "non_zd_claims_year": "99",
        "brand_new_3_3": "Yes",
        "old_3_3": "Yes",
        "vas": "No"
    },
    {
        "insurer_name": "TATA AIG 4+4 Plan",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "Yes",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required (with vehicle number) within Video TAT",
        "zd_claims_year": "7 ZD Claims Overall, Maximum 2 in a year",
        "non_zd_claims_year": "99",
        "brand_new_3_3": "Yes",
        "old_3_3": "Yes",
        "vas": "No"
    },
    {
        "insurer_name": "TATA AIG 5+5 Plan",
        "video_approval": "At PB end",
        "video_tat": "2 days",
        "short_partial": "Yes",
        "cng_kit_vi": "Yes",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required (with vehicle number) within Video TAT",
        "zd_claims_year": "9 ZD Claims Overall, Maximum 2 in a year",
        "non_zd_claims_year": "99",
        "brand_new_3_3": "Yes",
        "old_3_3": "Yes",
        "vas": "No"
    }
];
// You will need to add your insurance data here in the future
/*
const insuranceData =
// You will need to add your insurance data here in the future
/*
const insuranceData = [
    {
        "insurer_name": "National",
        "commercial": "Yes",
        "video_approval": "At PB end",
        "video_tat": "24 Hours",
        "short_partial": "Yes",
        "artificial_low_lighting": "No",
        "scar_declaration": "Declaration Required within Video TAT",
        "zd_claims_year": "ZD Plan: 2, ZD+: Unlimited",
        "non_zd_claims_year": "Unlimited",
        "brand_new_3_3": "No",
        "old_3_3": "No"
    },
    // ... all other 27 companies if needed];
*/

function populateTable(data) {
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) {
        console.error("Error: tableBody element not found for insuranceTable.");
        return;
    }
    tableBody.innerHTML = ''; // Clear existing rows
    if (data.length === 0) {
        // Display a message if no data is available
        tableBody.innerHTML = '<tr><td colspan="12" class="p-4 text-center text-gray-500">No insurance data available. Please add data to the "insuranceData" array in the script.</td></tr>';
        return;
    }
    data.forEach(item => {
        const row = document.createElement('tr');
        row.className = 'table-row border-b';
        row.innerHTML = `
                  <td class="p-2 font-medium text-indigo-900">${item.insurer_name}</td>
                  <td class="p-2">${item.zd_claims_year}</td>
                  <td class="p-2">${item.non_zd_claims_year}</td>
                  <td class="p-2">${item.video_approval}</td>
                  <td class="p-2">${item.video_tat}</td>
                  <td class="p-2 ${item.short_partial === 'Yes' ? 'text-green-700' : 'text-red-700'}">${item.short_partial}</td>
                  <td class="p-2 ${item.cng_kit_vi === 'Yes' ? 'text-green-700' : 'text-red-700'}">${item.cng_kit_vi}</td>
                  <td class="p-2 ${item.artificial_low_lighting === 'Yes' ? 'text-green-700' : 'text-red-700'}">${item.artificial_low_lighting}</td>
                  <td class="p-2">${item.scar_declaration}</td>
                  <td class="p-2 ${item.brand_new_3_3 === 'Yes' ? 'text-green-700' : 'text-red-700'}">${item.brand_new_3_3}</td>
                  <td class="p-2 ${item.old_3_3 === 'Yes' ? 'text-green-700' : 'text-red-700'}">${item.old_3_3}</td>
                  <td class="p-2 ${item.vas === 'Yes' ? 'text-green-700' : 'text-red-700'}">${item.vas}</td>
              `;
        tableBody.appendChild(row);
    });
}

function sortTable(column, order) {
    // Create a copy of the original data to sort, to avoid modifying the global `insuranceData` directly
    const sortedData = [...insuranceData].sort((a, b) => {
        const aValue = String(a[column]).toLowerCase(); // Ensure values are strings for comparison
        const bValue = String(b[column]).toLowerCase();

        if (order === 'asc') {
            return aValue > bValue ? 1 : -1;
        } else {
            return aValue < bValue ? 1 : -1;
        }
    });
    populateTable(sortedData);
}

function setupInsuranceDashboardListeners() {
    // Remove existing listeners to prevent multiple bindings if the page is opened multiple times
    const tableHeaders = document.querySelectorAll('#insuranceTable .table-header');
    tableHeaders.forEach(header => {
        // Remove previous event listener safely by recreating the element
        const newHeader = header.cloneNode(true);
        header.parentNode.replaceChild(newHeader, header);
    });

    // Add event listeners to the newly (or freshly cloned) table headers
    document.querySelectorAll('#insuranceTable .table-header').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.column;
            const currentOrder = header.classList.contains('sort-asc') ? 'desc' : 'asc';

            document.querySelectorAll('#insuranceTable .table-header').forEach(h => {
                h.classList.remove('sort-asc', 'sort-desc');
                h.classList.add('sort-icon'); /* Default icon wapas add karein */
            });

            header.classList.remove('sort-icon'); /* Current header se default icon hatayen */
            header.classList.add(currentOrder === 'asc' ? 'sort-asc' : 'sort-desc');

            sortTable(column, currentOrder);
        });
    });

    // Remove existing listener for search input and re-add
    const searchInput = document.getElementById('searchInput');
    // searchInput maujood hai ya nahi, check karein clone karne se pehle
    if (searchInput) {
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);

        newSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredData = insuranceData.filter(item =>
                item.insurer_name.toLowerCase().includes(searchTerm)
            );
            populateTable(filteredData);
        });
    }
}

// Data for Inspection Waiver
const inspectionWaiverData = [
    { "Insurer Name": "Tata AIG", "Policy Waiver": "1 Day" },
    { "Insurer Name": "Reliance", "Policy Waiver": "15 Days (Renewal), 1 Day (New, Rollover)" },
    { "Insurer Name": "Bajaj Allianz", "Policy Waiver": "5 Days" },
    { "Insurer Name": "Chola MS", "Policy Waiver": "5 Days" },
    { "Insurer Name": "National Insurance", "Policy Waiver": "5 Days" },
    { "Insurer Name": "Shriram General Insurance", "Policy Waiver": "5 Days" },
    { "Insurer Name": "United Insurance", "Policy Waiver": "5 Days" },
    { "Insurer Name": "Zurich Kotak General Insurance", "Policy Waiver": "5 Days" },
    { "Insurer Name": "Royal Sundaram Insurance", "Policy Waiver": "7 Days" },
    { "Insurer Name": "New India Assurance", "Policy Waiver": "1 Day" },
    { "Insurer Name": "Oriental", "Policy Waiver": "3 Days" },
    { "Insurer Name": "HDFC ERGO", "Policy Waiver": "5 Days" },
    { "Insurer Name": "ICICI Lombard General Insurance Company Ltd", "Policy Waiver": "No Waiver" },
    { "Insurer Name": "DIGIT", "Policy Waiver": "No Waiver" },
    { "Insurer Name": "Future Generali", "Policy Waiver": "No Waiver" },
    { "Insurer Name": "IFFCO Tokio", "Policy Waiver": "No Waiver" },
    { "Insurer Name": "Liberty General Insurance", "Policy Waiver": "No Waiver" },
    { "Insurer Name": "Magma HDI General Insurance", "Policy Waiver": "No Waiver" },
    { "Insurer Name": "Universal Sompo", "Policy Waiver": "No Waiver" },
    { "Insurer Name": "Zuno", "Policy Waiver": "No Waiver" },
    { "Insurer Name": "SBI", "Policy Waiver": "Only Renewal (5 Days)" }
];

function populateInspectionWaiverTable(data) {
    const tableBody = document.getElementById('inspectionWaiverTableBody');
    // Check if tableBody exists before proceeding
    if (!tableBody) {
        console.error("Error: inspectionWaiverTableBody element not found.");
        return;
    }
    tableBody.innerHTML = ''; // Clear existing rows
    data.forEach(item => {
        const row = document.createElement('tr');
        const waiverText = item["Policy Waiver"].toLowerCase();
        let waiverClass = '';
        if (waiverText.includes("no waiver")) {
            waiverClass = 'no-waiver';
        } else if (waiverText.includes("days") || waiverText.includes("day")) {
            waiverClass = 'days-waiver';
        }

        row.innerHTML = `
                  <td>${item["Insurer Name"]}</td>
                  <td class="policy-waiver-column ${waiverClass}">${item["Policy Waiver"]}</td>
              `;
        tableBody.appendChild(row);
    });
}

// #endregion

// #region 🔒 RSA & CONTACT DATA
// Function to clean numbers and replace commas with slashes
function cleanAndFormatNumber(numberString) {
    if (!numberString) return "";
    return numberString.replace(/,/g, '/').trim();
}

const rsaContactData = [

    { "Sr.": "1", "Insurer Name": "Bajaj Allianz", "RSA and Toll Free Number": "1800 209 5858 / 1800 209 0144 / 1800 103 5858", "Claim No.": "1800 209 0144 / 1800-209-5858" },
    { "Sr.": "2", "Insurer Name": "United Insurance", "RSA and Toll Free Number": "7042113114 (Roadzen-delhi) and 1800 210 2051 (ROI)", "Claim No.": "" },
    { "Sr.": "3", "Insurer Name": "Digit General", "RSA and Toll Free Number": "1800 258 5956 / (7026061234-whatsapp)", "Claim No.": "1800 103 4448" },
    { "Sr.": "4", "Insurer Name": "Edelweiss (Zuno)", "RSA and Toll Free Number": "22 4231 2000 / 1800 12 000", "Claim No.": "" },
    { "Sr.": "5", "Insurer Name": "Future Generali", "RSA and Toll Free Number": "1860 500 3333 / 1800 220 233 / 022 67837800", "Claim No.": "" },
    { "Sr.": "6", "Insurer Name": "HDFC Ergo", "RSA and Toll Free Number": "022 6234 6234 / 0120 6234 6234", "Claim No.": "" },
    { "Sr.": "7", "Insurer Name": "Iffco Tokio", "RSA and Toll Free Number": "1800 103 5499", "Claim No.": "" },
    { "Sr.": "8", "Insurer Name": "Kotak General Insurance", "RSA and Toll Free Number": "1800 266 4545", "Claim No.": "" },
    { "Sr.": "9", "Insurer Name": "Magma HDI", "RSA and Toll Free Number": "1800 266 3202", "Claim No.": "" },
    { "Sr.": "10", "Insurer Name": "Reliance General Insurance", "RSA and Toll Free Number": "022 4890 3009 / 1800 3009 / 022 48947020", "Claim No.": "" },
    { "Sr.": "11", "Insurer Name": "Royal Sundaram", "RSA and Toll Free Number": "1800 568 9999", "Claim No.": "" },
    { "Sr.": "12", "Insurer Name": "SBI General Insurance", "RSA and Toll Free Number": "1800 22 1111 / 1800 102 1111", "Claim No.": "" },
    { "Sr.": "13", "Insurer Name": "Shriram General Insurance", "RSA and Toll Free Number": "1800 300 30000 / 1800 103 3009", "Claim No.": "" },
    { "Sr.": "14", "Insurer Name": "TATA AIG", "RSA and Toll Free Number": "1800 266 7780", "Claim No.": "" },
    { "Sr.": "15", "Insurer Name": "Universal Sompo", "RSA and Toll Free Number": "1800 22 4030 / 1800 200 5142 / 022 27639800 / 1800 22 4090 / 1800 200 4030", "Claim No.": "" },
    { "Sr.": "16", "Insurer Name": "Raheja QBE", "RSA and Toll Free Number": "1800 102 7723", "Claim No.": "18001027723" },
    { "Sr.": "17", "Insurer Name": "Oriental Insurance", "RSA and Toll Free Number": "1800 309 1209", "Claim No.": "1800118485 / 011-33208485" },
    { "Sr.": "18", "Insurer Name": "New India Insurance", "RSA and Toll Free Number": "1800-209-1415", "Claim No.": "1800-209-1415" },
    { "Sr.": "19", "Insurer Name": "ICICI Lombard", "RSA and Toll Free Number": "1800 2666", "Claim No.": "1800 2666" },
    { "Sr.": "20", "Insurer Name": "National", "RSA and Toll Free Number": "1800 345 0330", "Claim No.": "" },
    { "Sr.": "21", "Insurer Name": "Liberty Videocon", "RSA and Toll Free Number": "1800 266 5844", "Claim No.": "" },
    { "Sr.": "22", "Insurer Name": "PB_What's App No.", "RSA and Toll Free Number": "8506013131", "Claim No.": "" },
    { "Sr.": "23", "Insurer Name": "PB_Service Team No.", "RSA and Toll Free Number": "1800-258-5970", "Claim No.": "" },
    { "Sr.": "24", "Insurer Name": "PB_Health Renewal Team No.", "RSA and Toll Free Number": "1800-572-3919", "Claim No.": "" },
    { "Sr.": "25", "Insurer Name": "PB_Health Sales Team No.", "RSA and Toll Free Number": "1800-419-7715", "Claim No.": "" },
    { "Sr.": "26", "Insurer Name": "PB_Car Motor Sales Team No.", "RSA and Toll Free Number": "1800-419--7716", "Claim No.": "" },
    { "Sr.": "27", "Insurer Name": "PB_Term/Jeevan Bima Sales Team No.", "RSA and Toll Free Number": "1800-419-7713", "Claim No.": "" },
    { "Sr.": "28", "Insurer Name": "PB_Investment Sales Team No.", "RSA and Toll Free Number": "1800-419-7717", "Claim No.": "" },
    { "Sr.": "29", "Insurer Name": "PB_Travel Sales Team No.", "RSA and Toll Free Number": "1800-419-7824", "Claim No.": "" },
    { "Sr.": "30", "Insurer Name": "PB_Corporate Sales Team No.", "RSA and Toll Free Number": "1800-309-0988", "Claim No.": "" },
    { "Sr.": "31", "Insurer Name": "PB_Corporate Service Team No.", "RSA and Toll Free Number": "1800-572-3918", "Claim No.": "" },
    { "Sr.": "32", "Insurer Name": "PB_Home Insurance Team No.", "RSA and Toll Free Number": "1800-258-7202", "Claim No.": "" },
    { "Sr.": "33", "Insurer Name": "PB_Commercial Vehicle Sales Team No.", "RSA and Toll Free Number": "0124-6108850", "Claim No.": "" },
    { "Sr.": "34", "Insurer Name": "PB_Service Email Id", "RSA and Toll Free Number": "CARE@POLICYBAZAAR.COM", "Claim No.": "" },
    { "Sr.": "35", "Insurer Name": "PB_NRI Team No.", "RSA and Toll Free Number": "0124-6656507", "Claim No.": "" },
    { "Sr.": "36", "Insurer Name": "PB Partner Agent Team No.", "RSA and Toll Free Number": "1800-120-800", "Claim No.": "" },
    { "Sr.": "37", "Insurer Name": "PB_Mail", "RSA and Toll Free Number": "SUPPORT@PBPARTNER.COM", "Claim No.": "" },
    { "Sr.": "38", "Insurer Name": "Paisa Bazaar.com Team No.", "RSA and Toll Free Number": "1800-208-8877", "Claim No.": "" },
    { "Sr.": "39", "Insurer Name": "PB_2W Renewal Team No.", "RSA and Toll Free Number": "0124-6138301", "Claim No.": "" },
    { "Sr.": "40", "Insurer Name": "PB_Sales Team No.", "RSA and Toll Free Number": "1800-419-7716", "Claim No.": "" },
    { "Sr.": "41", "Insurer Name": "PB_Claim Team NO.", "RSA and Toll Free Number": "1800-258-5881", "Claim No.": "" }

];

function populateRSATable(data) {
    const tableBody = document.getElementById('rsaContactTableBody');
    // Check if tableBody exists before proceeding
    if (!tableBody) {
        console.error("Error: rsaContactTableBody element not found.");
        return;
    }
    tableBody.innerHTML = ''; // Clear existing rows
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">No RSA & Contact data available.</td></tr>';
        return;
    }
    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
                  <td>${item["Sr."]}</td>
                  <td>${item["Insurer Name"]}</td>
                  <td>${cleanAndFormatNumber(item["RSA and Toll Free Number"])}</td>
                  <td>${cleanAndFormatNumber(item["Claim No."])}</td>
              `;
        tableBody.appendChild(row);
    });
}

function setupRSADashboardListeners() {
    // Remove existing listener for search input and re-add
    const rsaSearchInput = document.getElementById('rsaSearchInput');
    if (rsaSearchInput) {
        const newRSASearchInput = rsaSearchInput.cloneNode(true);
        rsaSearchInput.parentNode.replaceChild(newRSASearchInput, rsaSearchInput);

        newRSASearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredData = rsaContactData.filter(item =>
                item["Insurer Name"].toLowerCase().includes(searchTerm) ||
                cleanAndFormatNumber(item["RSA and Toll Free Number"]).toLowerCase().includes(searchTerm) ||
                cleanAndFormatNumber(item["Claim No."]).toLowerCase().includes(searchTerm)
            );
            populateRSATable(filteredData);
        });
    }
}


// Page load hone par images ko shuruat mein load karein
loadImages();

// #endregion

// #region 🔒 UPDATES BUTTON & MODAL
// --- NEW JAVASCRIPT FOR UPDATES BUTTON AND MODAL ---
document.addEventListener('DOMContentLoaded', function () {
    const updatesButton = document.getElementById('companyUpdatesButton');
    const updatesModal = document.getElementById('updatesModal');
    const closeModalButton = document.getElementById('closeModalButton');
    const updatesContainer = document.getElementById('updatesContainer');
    const latestUpdateSnippetElem = document.getElementById('latestUpdateSnippet');
    const newUpdateIndicator = document.getElementById('newUpdateIndicator');

    // --- IMPORTANT: DAILY UPDATES DATA SECTION (दैनिक अपडेट डेटा सेक्शन) ---
    // YAHAN AAP APNE DAILY UPDATES DALEIN. (यहां आप अपने दैनिक अपडेट डालें।)
    // Har company ke liye, updates ko array ke andar dalien. (हर कंपनी के लिए, अपडेट को एरे के अंदर डालें।)
    // Naye updates ko array ke shuruat (top) mein dalien, taaki woh pehle dikhein. (नए अपडेट को एरे की शुरुआत (शीर्ष) में डालें, ताकि वह पहले दिखें।)
    // Format: { date: "YYYY-MM-DD", update: "Your update text here" } (फॉर्मेट: { date: "YYYY-MM-DD", update: "आपका अपडेट टेक्स्ट यहां" })
    const companyUpdates = {
        "National": [],
        "New India Assurance": [],
        "Oriental": [],
        "United India": [],
        "Tata AIG": [{
            "date": "2025-06-30",
            "update": "TATA AIG Battery Protection Cover 1. Applicable for EV vehicles 2. Covers damage to battery, drive motor/electric motor, and includes chargers & cables as well (up to the IDV) 3. Provides coverage for water ingression, short circuit, or damages from accidental external factors 4. Counted as a claim 5. Allowed 2 times in a policy year"
        }
        ],
        "ICICI Lombard": [{
            "date": "2025-06-30",
            "update": "ICICI Lombard Battery Protection 1. Provides coverage for damages arising from water ingression or short circuits, resulting in loss or damage to the battery, drive motor/electric motor, and HEV (Hybrid Electric Vehicle) system 2. Coverage extends up to the Insured Declared Value (IDV) 3. Counted as a claim with a limit of 1 time per policy year 4. Charging cables and chargers are not included under this protection cover 5. Applicable for both Hybrid and EV vehicles"
        }
        ],
        "Zuno General": [],
        "Cholamandalam MS": [],
        "Future Generali": [],
        "Magma": [],
        "Raheja QBE": [],
        "Kotak": [],
        "SBI General": [{ date: "2025-08-11", update: "For all Pre issuance rejection: Please mark an email to customer regarding the refund process of 7 working days from the date of rejection" }],
        "Shriram": [],
        "IFFCO Tokio": [],
        "Liberty Videocon": [],
        "HDFC Ergo": [],
        "Reliance": [
            { date: "2025-06-12", update: "Unmasked KYC documents (Aadhar and PAN card) are needed for KYC in Reliance. Please ask the CX to share Aadhar card through Email." }
        ],
        "Bajaj Allianz": [],
        "Royal Sundaram": [],
        "Universal Sompo": [],
        "Digit": [{ date: "2025-06-12", update: "if cx comes for odometere update in DIGIT , THese 4 things needs to be captured:- odomeret reading, engraved, chasis number, 360 degree view and Engiene compartment" }, {
            "date": "2025-06-30",
            "update": "Digit Battery Protection Add-on 1. Applicable for both Hybrid and EV vehicles 2. Covers damage to battery, drive motor/electric motor, and Hybrid Electric Vehicle (HEV), including chargers and cables as well (up to the IDV) 3. Provides coverage for water ingression, short circuit, or damages from accidental external factors 4. Counted as a claim 5. Allowed 2 times in a policy year"
        }, { date: "2025-08-11", update: "For all Pre issuance rejection: Please mark an email to customer regarding the refund process of 7 working days from the date of rejection" }],
        "BAJAJ CPA": [],
        "DIGIT CPA": [],
        "CHOLA CPA": [],
        "KOTAK CPA": [],
        "RELIENCE CPA": [],
        "LIBERTY CPA": []
    };
    // --- END OF DAILY UPDATES DATA SECTION ---


    // This variable will hold the snippet for display on the button.
    let latestUpdateSnippetText = "";
    let hasNewUpdate = false;

    // Find the most recent update among all companies for the button snippet
    // This will pick the first company in the list that has an update.
    // If no updates are present in any company, hasNewUpdate will remain false.
    // Sort all updates by date in descending order to get the latest one
    const allUpdates = [];
    for (const company in companyUpdates) {
        if (companyUpdates.hasOwnProperty(company)) {
            companyUpdates[company].forEach(updateItem => {
                allUpdates.push({ company: company, date: updateItem.date, update: updateItem.update });
            });
        }
    }

    allUpdates.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (allUpdates.length > 0) {
        const mostRecentUpdate = allUpdates[0];
        latestUpdateSnippetText = `${mostRecentUpdate.company}: ${mostRecentUpdate.update}`;
        hasNewUpdate = true;
    }


    // Function to display the modal
    function showUpdatesModal() {
        if (updatesModal) updatesModal.classList.add('active');
        populateUpdates(); // Populate updates when modal opens
        // After showing, mark as seen for this session
        sessionStorage.setItem('updatesSeen', 'true');
        hideNewUpdateIndicatorAndSnippet(); // Hide indicator once modal is opened
        hideAllMainContent(); // Hide other main content when updates modal is open
    }

    // Function to hide the modal
    function closeUpdatesModal() {
        if (updatesModal) updatesModal.classList.remove('active');
        showAllMainContent(); // Show other main content when updates modal is closed
    }

    // Function to populate the updates in an accordion style
    function populateUpdates() {
        if (!updatesContainer) {
            console.error("Error: updatesContainer element not found.");
            return;
        }
        updatesContainer.innerHTML = ''; // Clear previous content
        // Dynamically add all company names as accordion headers
        const allCompanies = [
            "National", "New India Assurance", "Oriental", "United India", "Tata AIG",
            "ICICI Lombard", "Zuno General", "Cholamandalam MS", "Future Generali",
            "Magma", "Raheja QBE", "Kotak", "SBI General", "Shriram", "IFFCO Tokio",
            "Liberty Videocon", "HDFC Ergo", "Reliance", "Bajaj Allianz", "Royal Sundaram",
            "Universal Sompo", "Digit", "BAJAJ CPA", "DIGIT CPA", "CHOLA CPA",
            "KOTAK CPA", "RELIENCE CPA", "LIBERTY CPA"
        ];

        allCompanies.forEach(company => {
            const companyUpdatesList = companyUpdates[company] || []; // Use empty array if company not in data
            // Sort updates for each company by date descending
            companyUpdatesList.sort((a, b) => new Date(b.date) - new Date(a.date));

            const accordionItem = document.createElement('div');
            accordionItem.classList.add('accordion-item');

            const accordionHeader = document.createElement('div');
            accordionHeader.classList.add('accordion-header');
            accordionHeader.textContent = company; // Company name is always set
            accordionHeader.dataset.company = company; // Store company name for identifier

            const accordionContent = document.createElement('div');
            accordionContent.classList.add('accordion-content');
            const ul = document.createElement('ul');

            if (companyUpdatesList.length === 0) {
                const li = document.createElement('li');
                li.textContent = "No updates available yet."; // This text is added if no updates
                ul.appendChild(li);
            } else {
                companyUpdatesList.forEach(updateItem => {
                    const li = document.createElement('li');
                    li.innerHTML = `<strong>${updateItem.date}:</strong> ${updateItem.update}`;
                    ul.appendChild(li);
                });
            }

            accordionContent.appendChild(ul);
            accordionItem.appendChild(accordionHeader);
            accordionItem.appendChild(accordionContent);
            updatesContainer.appendChild(accordionItem);
        });

        // Add event listeners to all accordion headers
        document.querySelectorAll('.accordion-header').forEach(header => {
            header.addEventListener('click', function () {
                const content = this.nextElementSibling;
                // Toggle active class on header
                this.classList.toggle('active');
                // Toggle active class on content to control max-height and padding
                content.classList.toggle('active');
            });
        });
    }

    // --- New Update Indicator Logic ---
    function showNewUpdateIndicatorAndSnippet() {
        // If there's an update and it hasn't been seen in this session
        if (hasNewUpdate && !sessionStorage.getItem('updatesSeen')) {
            if (latestUpdateSnippetElem) latestUpdateSnippetElem.textContent = latestUpdateSnippetText;
            if (newUpdateIndicator) newUpdateIndicator.style.display = 'block'; // Show the pulsating dot
        } else {
            if (latestUpdateSnippetElem) latestUpdateSnippetElem.textContent = ''; // Clear snippet
            if (newUpdateIndicator) newUpdateIndicator.style.display = 'none';
        }
    }

    function hideNewUpdateIndicatorAndSnippet() {
        if (latestUpdateSnippetElem) latestUpdateSnippetElem.textContent = '';
        if (newUpdateIndicator) newUpdateIndicator.style.display = 'none';
    }

    // --- Event Listeners for the New Updates Feature ---
    if (updatesButton) updatesButton.addEventListener('click', showUpdatesModal);
    if (closeModalButton) closeModalButton.addEventListener('click', closeUpdatesModal);
    // Close modal if clicked directly on the overlay background
    if (updatesModal) {
        updatesModal.addEventListener('click', function (event) {
            if (event.target === updatesModal) { // Only closes if clicked on the dark background
                closeUpdatesModal();
            }
        });
    }

    // Initial call to display new update indicator/snippet on page load
    showNewUpdateIndicatorAndSnippet();
});
// Fill CSAT & Quality dropdowns + AHT + Absenteeism
window.onload = function () {
    let csatSelect = document.getElementById("incentiveCSAT");
    let qualitySelect = document.getElementById("incentiveQuality");
    let minSelect = document.getElementById("incentiveAHTMin");
    let secSelect = document.getElementById("incentiveAHTSec");
    let absentSelect = document.getElementById("incentiveAbsent");

    // Clear existing options to prevent duplication issues
    if (csatSelect) csatSelect.innerHTML = '';
    if (qualitySelect) qualitySelect.innerHTML = '';
    if (minSelect) minSelect.innerHTML = '';
    if (secSelect) secSelect.innerHTML = '';
    if (absentSelect) absentSelect.innerHTML = '';

    // CSAT 80–100
    if (csatSelect) {
        for (let i = 80; i <= 100; i++) {
            csatSelect.innerHTML += `<option value="${i}">${i}%</option>`;
            if (i < 100) csatSelect.innerHTML += `<option value="${i}+">${i}+%</option>`;
        }
        csatSelect.value = "90";
    }

    // Quality 40–100
    if (qualitySelect) {
        for (let i = 40; i <= 100; i++) {
            qualitySelect.innerHTML += `<option value="${i}">${i}%</option>`;
            if (i < 100) qualitySelect.innerHTML += `<option value="${i}+">${i}+%</option>`;
        }
        qualitySelect.value = "90";
    }

    // AHT minutes (2–7 min)
    if (minSelect) {
        for (let i = 2; i <= 7; i++) {
            minSelect.innerHTML += `<option value="${i}">${i} Min</option>`;
        }
        minSelect.value = "4";
    }

    // AHT seconds (0 to 59 sec)
    if (secSelect) {
        for (let i = 0; i < 60; i++) {
            secSelect.innerHTML += `<option value="${i}">${i} Sec</option>`;
        }
        secSelect.value = "30";
    }

    // Absenteeism (0 to 25 days)
    if (absentSelect) {
        for (let i = 0; i <= 25; i++) {
            absentSelect.innerHTML += `<option value="${i}">${i} ${i <= 1 ? "Day" : "Days"}</option>`;
        }
        absentSelect.value = "0";
    }

    // Scorecard Initialization
    let scCallCSAT = document.getElementById("scCallCSAT");
    let scTicketCSAT = document.getElementById("scTicketCSAT");
    let scQuality = document.getElementById("scQuality");
    let scAudit = document.getElementById("scAudit");
    let scAHTMin = document.getElementById("scAHTMin");
    let scAHTSec = document.getElementById("scAHTSec");
    let scLateLogin = document.getElementById("scLateLogin");
    let scLoginHrs = document.getElementById("scLoginHrs");
    let scLoginMins = document.getElementById("scLoginMins");

    if (scCallCSAT) {
        for (let i = 0; i <= 100; i++) {
            scCallCSAT.innerHTML += `<option value="${i}">${i}%</option>`;
            if (i < 100) scCallCSAT.innerHTML += `<option value="${i}+">${i}+%</option>`;
        }
        scCallCSAT.value = "90";
    }
    if (scTicketCSAT) {
        for (let i = 0; i <= 100; i++) {
            scTicketCSAT.innerHTML += `<option value="${i}">${i}%</option>`;
            if (i < 100) scTicketCSAT.innerHTML += `<option value="${i}+">${i}+%</option>`;
        }
        scTicketCSAT.value = "90";
    }
    if (scQuality) {
        for (let i = 0; i <= 100; i++) {
            scQuality.innerHTML += `<option value="${i}">${i}%</option>`;
            if (i < 100) scQuality.innerHTML += `<option value="${i}+">${i}+%</option>`;
        }
        scQuality.value = "90";
    }
    if (scAudit) {
        for (let i = 0; i <= 100; i++) {
            scAudit.innerHTML += `<option value="${i}">${i}%</option>`;
            if (i < 100) scAudit.innerHTML += `<option value="${i}+">${i}+%</option>`;
        }
        scAudit.value = "80";
    }
    if (scAHTMin) {
        for (let i = 0; i <= 15; i++) {
            scAHTMin.innerHTML += `<option value="${i}">${i} Min</option>`;
        }
        scAHTMin.value = "4";
    }
    if (scAHTSec) {
        for (let i = 0; i < 60; i++) {
            scAHTSec.innerHTML += `<option value="${i}">${i} Sec</option>`;
        }
        scAHTSec.value = "30";
    }
    if (scLateLogin) {
        for (let i = 0; i <= 31; i++) {
            scLateLogin.innerHTML += `<option value="${i}">${i} ${i <= 1 ? "Day" : "Days"}</option>`;
        }
        scLateLogin.value = "0";
    }
    if (scLoginHrs) {
        for (let i = 0; i <= 24; i++) {
            scLoginHrs.innerHTML += `<option value="${i}">${i} Hrs</option>`;
        }
        scLoginHrs.value = "9";
    }
    if (scLoginMins) {
        for (let i = 0; i < 60; i++) {
            scLoginMins.innerHTML += `<option value="${i}">${i} Min</option>`;
        }
        scLoginMins.value = "0";
    }
};

// Open Modal
window.openIncentiveModal = function () {
    document.getElementById("incentiveModal").style.display = "flex";
};

// Close Modal
window.closeIncentiveModal = function () {
    document.getElementById("incentiveModal").style.display = "none";
};

// --- Helper Functions ---

// Step 1: Calling CSAT multiplier (Base Amount)
function getCSATBaseAmount(csatValue) {
    let csat = parseFloat(csatValue);
    let isPlus = String(csatValue).includes("+");

    // Convert e.g., "93+" to a slightly higher number to use <= logic easily
    let val = isPlus ? csat + 0.1 : csat;

    // As per requirement:
    // exactly 93 -> 8000, 93+ -> 10000
    // upper bounds are inclusive
    if (val <= 85) return 0;
    if (val <= 87) return 2000;
    if (val <= 90) return 5000;
    if (val <= 91) return 6000;
    if (val <= 92) return 7000;
    if (val <= 93) return 8000;

    return 10000; // > 93
}

// Step 2: AHT Multiplier
function getAHTMultiplier(ahtSecs) {
    // 03:50 = 230 secs
    // 04:50 = 290 secs
    // 06:00 = 360 secs

    // Agar time exact boundary ho tabhi agli range mein jayega:
    if (ahtSecs < 230) return 1.0;     // e.g. 3m 49s = 100%
    if (ahtSecs < 290) return 0.95;    // e.g. exactly 3m 50s = 95%
    if (ahtSecs < 360) return 0.90;    // e.g. exactly 4m 50s = 90%

    return 0.0;                        // exactly 6m 00s = 0%
}

// Step 3: Quality Score Multiplier
function getQualityMultiplier(qualityValue) {
    let quality = parseFloat(qualityValue);
    let isPlus = String(qualityValue).includes("+");

    let val = isPlus ? quality + 0.1 : quality;

    // Upper bounds inclusive
    if (val <= 75) return 0.0;
    if (val <= 80) return 0.75;
    if (val <= 85) return 0.90;
    if (val <= 90) return 1.00;

    return 1.10; // > 90
}

// Step 4: Absenteeism Days Multiplier
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
    return 0.0; // Failsafe for > 25 days
}

// --- Main Logic ---
window.calculateIncentive = function () {
    let csatValue = document.getElementById("incentiveCSAT").value;
    let qualityValue = document.getElementById("incentiveQuality").value;
    let min = parseInt(document.getElementById("incentiveAHTMin").value);
    let sec = parseInt(document.getElementById("incentiveAHTSec").value);
    let absentDays = parseInt(document.getElementById("incentiveAbsent").value);

    let ahtSecs = min * 60 + sec; // total seconds

    // Calculate Step 1 Base Amount
    let baseAmount = getCSATBaseAmount(csatValue);

    // Calculate Step 2 AHT Multiplier
    let ahtMultiplier = getAHTMultiplier(ahtSecs);

    // Calculate Step 3 Quality Multiplier
    let qualityMultiplier = getQualityMultiplier(qualityValue);

    // Calculate Step 4 Absenteeism Multiplier
    let absentMultiplier = getAbsenteeismMultiplier(absentDays);

    // If Quality is too low or AHT is too high, it might 0 out the incentive early
    if (qualityMultiplier === 0) {
        document.getElementById("incentiveResult").innerHTML =
            "<p style='color:red;'>❌ Incentive Cancelled (Quality < 75%)</p>";
        return;
    }

    if (ahtMultiplier === 0) {
        document.getElementById("incentiveResult").innerHTML =
            "<p style='color:red;'>❌ Incentive Cancelled (AHT > 06:00)</p>";
        return;
    }

    // Final Calculation: Each multiplier applies independently on base amount (additive, not compound)
    let totalIncentive = baseAmount * ahtMultiplier
        + baseAmount * (qualityMultiplier - 1)
        + baseAmount * (absentMultiplier - 1);

    // Ensure incentive doesn't go below 0
    if (totalIncentive < 0) totalIncentive = 0;

    document.getElementById(
        "incentiveResult"
    ).innerHTML = `
        <p>📊 Base Amount (CSAT): ₹${baseAmount}</p>
        <p>⏳ AHT Multiplier: ${(ahtMultiplier * 100).toFixed(0)}%</p>
        <p>🏆 Quality Multiplier: ${(qualityMultiplier * 100).toFixed(0)}%</p>
        <p>📅 Absenteeism Multiplier: ${(absentMultiplier * 100).toFixed(0)}%</p>
        <hr style="margin: 5px 0; border-top: 1px dotted #ccc;">
        <p style="font-size: 1.1em; color: #10b981;">💰 Final Incentive: <b>₹${totalIncentive.toFixed(0)}</b></p>
    `;
};

// --- Incentive Slab Toggle ---
window.toggleIncentiveSlab = function () {
    const container = document.getElementById("incentiveSlabContainer");
    if (!container) return;

    if (container.style.display === "none" || !container.style.display) {
        container.style.display = "block";
        container.innerHTML = getSlabHTML();
    } else {
        container.style.display = "none";
    }
};

function getSlabHTML() {
    const tableStyle = `width:100%; border-collapse:collapse; margin-bottom:15px; font-size:13px;`;
    const thStyle = `padding:6px 8px; text-align:left; border:1px solid #d1d5db; font-weight:600;`;
    const tdStyle = `padding:5px 8px; border:1px solid #d1d5db; color:#1f2937;`;
    const bestTd = `padding:5px 8px; border:1px solid #d1d5db; color:#047857; font-weight:700; background:#ecfdf5;`;
    const worstTd = `padding:5px 8px; border:1px solid #d1d5db; color:#dc2626; font-weight:700; background:#fef2f2;`;
    const altRow = `background:#f9fafb;`;

    return `
        <div style="margin-top:10px;">
            <!-- CSAT Slab -->
            <h4 style="color:#1f2937; margin:10px 0 5px; font-size:14px; font-weight:700;">📊 CSAT Base Amount</h4>
            <table style="${tableStyle}">
                <thead>
                    <tr>
                        <th style="${thStyle} background:#374151; color:white;">CSAT %</th>
                        <th style="${thStyle} background:#374151; color:white;">Base Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td style="${worstTd}">≤ 85%</td><td style="${worstTd}">₹0</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">85+ – 87%</td><td style="${tdStyle}">₹2,000</td></tr>
                    <tr><td style="${tdStyle}">87+ – 90%</td><td style="${tdStyle}">₹5,000</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">90+ – 91%</td><td style="${tdStyle}">₹6,000</td></tr>
                    <tr><td style="${tdStyle}">91+ – 92%</td><td style="${tdStyle}">₹7,000</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">92+ – 93%</td><td style="${tdStyle}">₹8,000</td></tr>
                    <tr><td style="${bestTd}">93+ %</td><td style="${bestTd}">₹10,000</td></tr>
                </tbody>
            </table>

            <!-- AHT Slab -->
            <h4 style="color:#1f2937; margin:10px 0 5px; font-size:14px; font-weight:700;">⏳ AHT Multiplier</h4>
            <table style="${tableStyle}">
                <thead>
                    <tr>
                        <th style="${thStyle} background:#374151; color:white;">AHT</th>
                        <th style="${thStyle} background:#374151; color:white;">Multiplier</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td style="${bestTd}">< 3:50</td><td style="${bestTd}">100%</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">3:50 – 4:49</td><td style="${tdStyle}">95%</td></tr>
                    <tr><td style="${tdStyle}">4:50 – 5:59</td><td style="${tdStyle}">90%</td></tr>
                    <tr><td style="${worstTd}">≥ 6:00</td><td style="${worstTd}">0% (Cancel)</td></tr>
                </tbody>
            </table>

            <!-- Quality Slab -->
            <h4 style="color:#1f2937; margin:10px 0 5px; font-size:14px; font-weight:700;">🏆 Quality Multiplier</h4>
            <table style="${tableStyle}">
                <thead>
                    <tr>
                        <th style="${thStyle} background:#374151; color:white;">Quality %</th>
                        <th style="${thStyle} background:#374151; color:white;">Multiplier</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td style="${worstTd}">≤ 75%</td><td style="${worstTd}">0% (Cancel)</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">75+ – 80%</td><td style="${tdStyle}">75%</td></tr>
                    <tr><td style="${tdStyle}">80+ – 85%</td><td style="${tdStyle}">90%</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">85+ – 90%</td><td style="${tdStyle}">100%</td></tr>
                    <tr><td style="${bestTd}">90+ %</td><td style="${bestTd}">110%</td></tr>
                </tbody>
            </table>

            <!-- Absenteeism Slab -->
            <h4 style="color:#1f2937; margin:10px 0 5px; font-size:14px; font-weight:700;">📅 Absenteeism Multiplier</h4>
            <table style="${tableStyle}">
                <thead>
                    <tr>
                        <th style="${thStyle} background:#374151; color:white;">Absent Days</th>
                        <th style="${thStyle} background:#374151; color:white;">Multiplier</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td style="${bestTd}">0 Day</td><td style="${bestTd}">110%</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">1 Day</td><td style="${tdStyle}">100%</td></tr>
                    <tr><td style="${tdStyle}">2 Days</td><td style="${tdStyle}">95%</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">3 Days</td><td style="${tdStyle}">90%</td></tr>
                    <tr><td style="${tdStyle}">4 Days</td><td style="${tdStyle}">85%</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">5–7 Days</td><td style="${tdStyle}">80%</td></tr>
                    <tr><td style="${tdStyle}">8–10 Days</td><td style="${tdStyle}">75%</td></tr>
                    <tr style="${altRow}"><td style="${tdStyle}">11–15 Days</td><td style="${tdStyle}">70%</td></tr>
                    <tr><td style="${tdStyle}">16–21 Days</td><td style="${tdStyle}">60%</td></tr>
                    <tr><td style="${worstTd}">22–25 Days</td><td style="${worstTd}">30%</td></tr>
                </tbody>
            </table>
        </div>
    `;
}

// Open/Close Scorecard Modal
window.openScorecardModal = function () {
    const sm = document.getElementById("scorecardModal");
    if (sm) sm.style.display = "flex";
};
window.closeScorecardModal = function () {
    const sm = document.getElementById("scorecardModal");
    if (sm) sm.style.display = "none";
};

// SCORECARD HELPERS (Boundary = lower slab)
function getScCallCSAT(tenure, val) {
    if (tenure === '0-3') {
        if (val <= 80) return 0;
        if (val <= 85) return 15;
        if (val <= 90) return 20;
        return 30; // > 90
    } else { // 3-6 and 6+ use same for Calling CSAT
        if (val <= 81) return 0;
        if (val <= 86) return 15;
        if (val <= 92) return 20;
        return 30;
    }
}

function getScTicketCSAT(tenure, val) {
    if (tenure === '0-3') {
        if (val <= 80) return 0;
        if (val <= 85) return 2;
        if (val <= 88) return 3;
        return 5;
    } else { // 3-6 and 6+
        if (val <= 80) return 0;
        if (val <= 85) return 2;
        if (val <= 90) return 3;
        return 5;
    }
}

function getScAHT(tenure, secs) {
    if (tenure === '0-3') {
        if (secs < 285) return 20;  // < 04:45
        if (secs <= 300) return 15; // <= 05:00
        if (secs <= 315) return 10; // <= 05:15
        return 0;
    } else if (tenure === '3-6') {
        if (secs < 270) return 20;  // < 04:30
        if (secs <= 285) return 15; // <= 04:45
        if (secs <= 300) return 10; // <= 05:00
        return 0;
    } else if (tenure === '6+') {
        if (secs < 255) return 20;  // < 04:15
        if (secs <= 270) return 15; // <= 04:30
        if (secs <= 285) return 10; // <= 04:45
        return 0;
    }
}

function getScQuality(tenure, val) {
    if (tenure === '0-3') {
        if (val <= 80) return 0;
        if (val <= 85) return 7;
        if (val <= 87) return 10;
        return 15;
    } else if (tenure === '3-6') {
        if (val <= 80) return 0;
        if (val <= 85) return 7;
        if (val <= 89) return 10;
        return 15;
    } else if (tenure === '6+') {
        if (val <= 80) return 0;
        if (val <= 85) return 7;
        if (val <= 90) return 10;
        return 15;
    }
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
    if (mins < 420) return 0;   // < 07:00
    if (mins <= 450) return 5;  // <= 07:30
    if (mins < 470) return 7;   // < 07:50
    return 10;                  // >= 07:50
}

function getScPerformanceRating(score) {
    if (score <= 61) return "C";
    if (score <= 70) return "B";
    if (score <= 81) return "B+";
    if (score <= 86) return "A-";
    if (score <= 91) return "A";
    return "A+";
}

window.calculateScorecard = function () {
    let tenure = document.getElementById("scTenure").value;

    // Helper to parse "92+" properly
    const parseParam = (str) => {
        let p = parseFloat(str);
        if (String(str).includes("+")) return p + 0.1;
        return p;
    };

    let callCsat = parseParam(document.getElementById("scCallCSAT").value);
    let ticCsat = parseParam(document.getElementById("scTicketCSAT").value);
    let qual = parseParam(document.getElementById("scQuality").value);
    let audit = parseParam(document.getElementById("scAudit").value);

    let ahtMin = parseInt(document.getElementById("scAHTMin").value);
    let ahtSec = parseInt(document.getElementById("scAHTSec").value);
    let ahtSecsTotal = (ahtMin * 60) + ahtSec;

    let lateLogin = parseInt(document.getElementById("scLateLogin").value);

    let logHrs = parseInt(document.getElementById("scLoginHrs").value);
    let logMins = parseInt(document.getElementById("scLoginMins").value);
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

    document.getElementById("scorecardResult").innerHTML = `
        <p style="text-align:center; margin-bottom:10px;"><span class="colorful-text" style="font-size:0.9em;">Created by Shivang</span></p>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>Calling CSAT:</span> <b>${ptCall} / 30</b></div>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>Ticket CSAT:</span> <b>${ptTic} / 5</b></div>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>AHT IB+CTC:</span> <b>${ptAht} / 20</b></div>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>Quality:</span> <b>${ptQual} / 15</b></div>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>Internal Audit:</span> <b>${ptAud} / 10</b></div>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>Late Login:</span> <b>${ptLate} / 10</b></div>
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dotted #ccc; margin-bottom:5px;"><span>Login Hour:</span> <b>${ptLog} / 10</b></div>
        
        <div style="text-align:center; margin-top:15px;">
            <p style="font-size: 1.3em; color: #0f766e; margin:0;">🏆 Total Score: <b>${totalScore} / 100</b></p>
            <p style="display:inline-block; margin:8px 0 0; padding:6px 16px; border-radius:999px; background:#ede9fe; color:#6d28d9; font-size:1.15em; font-weight:700;">Rating: ${performanceRating}</p>
        </div>
    `;
};
// Highlight "NO" cells in ADP table
document.addEventListener("DOMContentLoaded", () => {
    const adpTable = document.querySelector(".manual-vi-page table");
    if (adpTable) {
        adpTable.querySelectorAll("td").forEach(td => {
            if (td.textContent.trim().toUpperCase() === "NO") {
                td.classList.add("bg-red-100", "text-red-700", "font-semibold");
            }
        });
    }
});


// ========================================
// Company Owned Vehicle (COV) Modal Logic
// ========================================

// Company lists for 2W and 4W
const covCompanyLists = {
    "2W": ["SBI", "HDFC", "RSA", "ITGI (Iffco)", "Reliance", "SriRam", "USGI (Sompo)"],
    "4W": ["SBI", "HDFC", "RSA", "ITGI (Iffco)", "USGI (Sompo)"]
};

// Open COV Modal
function openCOVModal() {
    const modal = document.getElementById("covModal");
    if (modal) {
        modal.style.display = "flex";
        // Reset content when opening
        const covList = document.getElementById("covList");
        if (covList) {
            covList.innerHTML = '<p class="small">Select 2W or 4W to view companies.</p>';
        }
    }
}

// Close COV Modal
function closeCOVModal() {
    const modal = document.getElementById("covModal");
    if (modal) {
        modal.style.display = "none";
    }
}

// Show company list based on type (2W or 4W)
function showCOVList(type) {
    const covList = document.getElementById("covList");
    if (!covList) return;

    const companies = covCompanyLists[type];
    if (companies && companies.length > 0) {
        let html = `<ul class="cov-company-list">`;
        companies.forEach(company => {
            html += `<li>${company}</li>`;
        });
        html += `</ul>`;
        covList.innerHTML = html;
    } else {
        covList.innerHTML = '<p class="small">No companies found.</p>';
    }
}

// Event Listeners for COV Modal
document.addEventListener("DOMContentLoaded", () => {
    // Open modal on button click
    const btnCompanyOwned = document.getElementById("btnCompanyOwned");
    if (btnCompanyOwned) {
        btnCompanyOwned.addEventListener("click", openCOVModal);
    }

    // Close modal on close button click
    const covClose = document.getElementById("covClose");
    if (covClose) {
        covClose.addEventListener("click", closeCOVModal);
    }

    // Close modal on outside click
    const covModal = document.getElementById("covModal");
    if (covModal) {
        covModal.addEventListener("click", (event) => {
            if (event.target === covModal) {
                closeCOVModal();
            }
        });
    }

    // 2W button click
    const btn2W = document.getElementById("btn2W");
    if (btn2W) {
        btn2W.addEventListener("click", () => {
            btn2W.classList.add("active");
            if (btn4W) btn4W.classList.remove("active");
            showCOVList("2W");
        });
    }

    // 4W button click
    const btn4W = document.getElementById("btn4W");
    if (btn4W) {
        btn4W.addEventListener("click", () => {
            btn4W.classList.add("active");
            if (btn2W) btn2W.classList.remove("active");
            showCOVList("4W");
        });
    }
});

// Close COV Modal on ESC key
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        const covModal = document.getElementById("covModal");
        if (covModal && covModal.style.display === "flex") {
            closeCOVModal();
        }
    }
});

// ========== CHAT FEATURE (Firebase) ==========
const commentsRef = dbRef(db, 'comments');
const chatCanvas = document.getElementById('chatCanvas');
const chatMessages = document.getElementById('chatMessages');

function toggleChat(show = null) {
    const visible = !chatCanvas.classList.contains('translate-y-full');
    const shouldShow = show !== null ? show : !visible;
    chatCanvas.classList.toggle('translate-y-full', !shouldShow);
    if (shouldShow) {
        loadChatMessages();
        requestAnimationFrame(() => {
            chatCanvas.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
        });
    }
}

// Expose to global scope for inline onclick handlers
window.toggleChat = toggleChat;
window.sendMessage = sendChatMessage;
window.deleteMessage = deleteChatMessage;

// Also attach via addEventListener for reliability
const openChatBtn = document.getElementById('openChatBtn');
if (openChatBtn) {
    openChatBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleChat();
    });
}

window.addEventListener('click', function (e) {
    if (e.target?.closest?.('[data-chat-launcher="true"]')) {
        return;
    }
    if (chatCanvas && !chatCanvas.contains(e.target) && openChatBtn && !openChatBtn.contains(e.target)) {
        toggleChat(false);
    }
});

function loadChatMessages() {
    onValue(commentsRef, (snapshot) => {
        chatMessages.innerHTML = '';
        const data = snapshot.val();
        if (!data) {
            chatMessages.innerHTML = '<div class="p-3 rounded-md bg-gray-100 shadow-sm text-sm text-center">No messages yet.</div>';
            return;
        }
        const now = Date.now();
        const messages = Object.entries(data)
            .map(([key, val]) => ({ id: key, ...val }))
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        messages.forEach((msg) => {
            if (msg.autoDeleteAt && now >= msg.autoDeleteAt) {
                remove(dbRef(db, `comments/${msg.id}`)).catch(() => { });
            }
        });

        messages.forEach((msg, i) => {
            if (msg.autoDeleteAt && now >= msg.autoDeleteAt) return;
            const color = i % 2 === 0 ? 'bg-orange-100' : 'bg-blue-100';
            const div = document.createElement('div');
            div.className = `group relative p-3 rounded-md ${color} shadow-sm text-sm`;

            const row = document.createElement('div');
            row.className = 'flex justify-between';

            const messageText = document.createElement('div');
            messageText.textContent = msg.message || '';

            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-msg-btn absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700';
            deleteButton.dataset.id = msg.id;
            deleteButton.type = 'button';
            deleteButton.textContent = 'X';
            deleteButton.addEventListener('click', () => deleteChatMessage(msg.id));

            row.appendChild(messageText);
            row.appendChild(deleteButton);
            div.appendChild(row);
            chatMessages.appendChild(div);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, (error) => {
        console.error("Failed to load messages:", error);
        chatMessages.innerHTML = '<div class="p-3 rounded-md bg-red-100 shadow-sm text-sm text-red-600 text-center">⚠️ Unable to connect to server. Please check your internet or try again later.</div>';
    });
}

function sendChatMessage() {
    const messageBox = document.getElementById('chatMessage');
    const message = messageBox.value.trim();
    if (!message) return alert("Please type something.");
    messageBox.value = '';

    push(commentsRef, {
        message: message,
        username: null,
        timestamp: Date.now()
    }).catch((error) => {
        console.error("Failed to send message:", error);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'p-2 rounded-md bg-red-100 text-red-600 text-xs text-center mt-1';
        errorDiv.textContent = '⚠️ Failed to send. Server unreachable.';
        chatMessages.appendChild(errorDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

function scheduleExternalCodeMessageDeletion(commentId, autoDeleteAt) {
    if (!commentId || !autoDeleteAt) return;
    const delay = autoDeleteAt - Date.now();
    if (delay <= 0) {
        remove(dbRef(db, `comments/${commentId}`)).catch(() => { });
        return;
    }
    window.setTimeout(() => {
        remove(dbRef(db, `comments/${commentId}`)).catch(() => { });
    }, delay);
}

function deleteChatMessage(id) {
    const confirmed = confirm("Delete this message?");
    if (!confirmed) return;
    remove(dbRef(db, `comments/${id}`))
        .catch((error) => {
            console.error("Failed to delete message:", error);
            alert("⚠️ Could not delete message. Server unreachable.");
        });
}

// Send button click listener
const sendBtn = document.getElementById('sendChatBtn');
if (sendBtn) {
    sendBtn.addEventListener('click', sendChatMessage);
}

// Close chat button listener
const closeChatBtn = document.getElementById('closeChatBtn');
if (closeChatBtn) {
    closeChatBtn.addEventListener('click', () => toggleChat());
}

// Enter to send, Shift+Enter for newline
const chatInput = document.getElementById('chatMessage');
if (chatInput) {
    chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });
}

// ========================================
// 🐍 Snake Game Logic
// ========================================
let snakeCanvas, snakeCtx;
let snakeArea = 500; // Increased to 500
let gridSize = 25; // 20x20 grid for 500 canvas
let snake = [];
let food = {};
let dx = gridSize;
let dy = 0;
let snakeScore = 0;
let snakeInterval;
let snakeSpeed = 150;
let gameOverSnake = false;
let isSnakePaused = false;
let speedBurst = false;

window.startSnakeGame = function () {
    snakeCanvas = document.getElementById('snakeCanvas');
    snakeCtx = snakeCanvas.getContext('2d');

    // Reset state
    snake = [
        { x: 250, y: 250 },
        { x: 225, y: 250 },
        { x: 200, y: 250 }
    ];
    dx = gridSize;
    dy = 0;
    snakeScore = 0;
    snakeSpeed = 150;
    gameOverSnake = false;
    isSnakePaused = false;
    speedBurst = false;
    document.getElementById('snakeScore').textContent = snakeScore;
    document.getElementById('snakePauseOverlay').classList.add('hidden');
    document.getElementById('snakeGameOverOverlay').classList.add('hidden');

    createFood();
    if (snakeInterval) clearInterval(snakeInterval);
    snakeInterval = setInterval(mainSnake, snakeSpeed);
}

window.toggleSnakePause = function () {
    if (gameOverSnake || !snakeInterval) return;

    isSnakePaused = !isSnakePaused;
    const overlay = document.getElementById('snakePauseOverlay');

    if (isSnakePaused) {
        clearInterval(snakeInterval);
        overlay.classList.remove('hidden');
    } else {
        snakeInterval = setInterval(mainSnake, speedBurst ? 40 : snakeSpeed);
        overlay.classList.add('hidden');
    }
}

function mainSnake() {
    if (gameOverSnake || isSnakePaused) return;

    if (hasGameEnded()) {
        gameOverSnake = true;
        clearInterval(snakeInterval);

        // Custom Game Over UI
        document.getElementById('snakeFinalScore').textContent = snakeScore;
        document.getElementById('snakeGameOverOverlay').classList.remove('hidden');

        checkAndSaveScore('snake', snakeScore, true); // Higher is better
        return;
    }

    clearCanvas();
    drawFood();
    advanceSnake();
    drawSnake();
}

function clearCanvas() {
    snakeCtx.fillStyle = '#111827'; // tailwind gray-900 equivalent set via JS usually, but matching canvas bg
    snakeCtx.clearRect(0, 0, snakeCanvas.width, snakeCanvas.height);
    snakeCtx.fillRect(0, 0, snakeCanvas.width, snakeCanvas.height); // explicit fill
}

function drawSnake() {
    snake.forEach(drawSnakePart);
}

function drawSnakePart(snakePart) {
    snakeCtx.fillStyle = '#4ade80'; // snake color
    snakeCtx.strokeStyle = '#166534';
    snakeCtx.fillRect(snakePart.x, snakePart.y, gridSize, gridSize);
    snakeCtx.strokeRect(snakePart.x, snakePart.y, gridSize, gridSize);
}

function advanceSnake() {
    let newX = snake[0].x + dx;
    let newY = snake[0].y + dy;

    // Wall Wrap Logic (Opposite side)
    if (newX < 0) newX = snakeArea - gridSize;
    else if (newX >= snakeArea) newX = 0;

    if (newY < 0) newY = snakeArea - gridSize;
    else if (newY >= snakeArea) newY = 0;

    const head = { x: newX, y: newY };
    snake.unshift(head);

    const hasEatenFood = head.x === food.x && head.y === food.y;
    if (hasEatenFood) {
        snakeScore += 10;
        document.getElementById('snakeScore').textContent = snakeScore;
        createFood();
        // Speed up very slightly
        if (snakeSpeed > 60) {
            snakeSpeed -= 2;
            if (!speedBurst && !isSnakePaused && !gameOverSnake) {
                clearInterval(snakeInterval);
                snakeInterval = setInterval(mainSnake, snakeSpeed);
            }
        }
    } else {
        snake.pop();
    }
}

function createFood() {
    food.x = Math.round((Math.random() * (snakeArea - gridSize)) / gridSize) * gridSize;
    food.y = Math.round((Math.random() * (snakeArea - gridSize)) / gridSize) * gridSize;

    // ensure food isnt on snake
    let onSnake = false;
    snake.forEach(function has_snake_eaten_food(part) {
        if (part.x === food.x && part.y === food.y) onSnake = true;
    });
    if (onSnake) createFood();
}

function drawFood() {
    snakeCtx.fillStyle = '#ef4444'; // red
    snakeCtx.strokeStyle = '#991b1b'; // darker red
    snakeCtx.fillRect(food.x, food.y, gridSize, gridSize);
    snakeCtx.strokeRect(food.x, food.y, gridSize, gridSize);
}

function hasGameEnded() {
    // Only Self collision
    for (let i = 4; i < snake.length; i++) {
        if (snake[i].x === snake[0].x && snake[i].y === snake[0].y) return true;
    }
    return false;
}

document.addEventListener("keydown", function (event) {
    // Only process if snake overlay is active
    if (!document.getElementById('snakeGameOverlay').classList.contains('active')) return;

    // Spacebar Pause/Resume
    if (event.code === 'Space') {
        event.preventDefault();
        window.toggleSnakePause();
        return;
    }

    if (isSnakePaused || gameOverSnake) return;

    const LEFT_KEY = 37; const A_KEY = 65;
    const RIGHT_KEY = 39; const D_KEY = 68;
    const UP_KEY = 38; const W_KEY = 87;
    const DOWN_KEY = 40; const S_KEY = 83;

    const keyPressed = event.keyCode;
    const isDirectionKey = [37, 38, 39, 40, 65, 68, 87, 83].includes(keyPressed);

    const goingUp = dy === -gridSize;
    const goingDown = dy === gridSize;
    const goingRight = dx === gridSize;
    const goingLeft = dx === -gridSize;

    if ((keyPressed === LEFT_KEY || keyPressed === A_KEY) && !goingRight) { dx = -gridSize; dy = 0; }
    if ((keyPressed === UP_KEY || keyPressed === W_KEY) && !goingDown) { dx = 0; dy = -gridSize; }
    if ((keyPressed === RIGHT_KEY || keyPressed === D_KEY) && !goingLeft) { dx = gridSize; dy = 0; }
    if ((keyPressed === DOWN_KEY || keyPressed === S_KEY) && !goingUp) { dx = 0; dy = gridSize; }

    // Speed burst on arrow key hold
    if (isDirectionKey) {
        if (!speedBurst) {
            speedBurst = true;
            clearInterval(snakeInterval);
            snakeInterval = setInterval(mainSnake, 40); // Fast speed
        }

        // Prevent scrolling default behavior
        if ([37, 38, 39, 40, 32].indexOf(event.keyCode) > -1) {
            event.preventDefault();
        }
    }
});

// Remove speed burst on key up
document.addEventListener("keyup", function (event) {
    if (!document.getElementById('snakeGameOverlay').classList.contains('active') || isSnakePaused || gameOverSnake) return;

    const isDirectionKey = [37, 38, 39, 40, 65, 68, 87, 83].includes(event.keyCode);
    if (isDirectionKey && speedBurst) {
        speedBurst = false;
        clearInterval(snakeInterval);
        snakeInterval = setInterval(mainSnake, snakeSpeed); // Normal speed
    }
});


// ========================================
// 🎾 Bounce Ball Game Logic
// ========================================
// ========================================
// Game Hub & Firebase Leaderboard System
// ========================================
const gameHubOverlay = document.getElementById('gameHubOverlay');
const leaderboardUnits = {
    snake: 'points',
    bounce: 'pts',
    airforce: 'pts'
};
const AIRFORCE_PLAYER_NAME_KEY = 'airforcePlayerName';
const CHESS_PLAYER_NAME_KEY = 'chessPlayerName';

function getStoredAirforcePlayerName() {
    return (localStorage.getItem(AIRFORCE_PLAYER_NAME_KEY) || '').trim();
}

function setStoredAirforcePlayerName(name) {
    localStorage.setItem(AIRFORCE_PLAYER_NAME_KEY, name.trim());
}

window.openGameHub = function () {
    gameHubOverlay.classList.add('active');
};

window.closeGameHub = function () {
    gameHubOverlay.classList.remove('active');
};

window.backToHub = function (overlayId) {
    document.getElementById(overlayId).classList.remove('active');
    if (overlayId === 'snakeGameOverlay') clearInterval(snakeInterval);
    if (overlayId === 'bounceGameOverlay') clearInterval(bounceInterval);
    openGameHub();
};

window.launchGame = function (gameType) {
    closeGameHub();
    if (gameType === 'snake') {
        document.getElementById('snakeGameOverlay').classList.add('active');
        loadLeaderboard('snake', leaderboardUnits.snake);
        window.startSnakeGame();
    } else if (gameType === 'bounce') {
        document.getElementById('bounceGameOverlay').classList.add('active');
        loadLeaderboard('bounce', leaderboardUnits.bounce);
        window.startBounceGame();
    } else if (gameType === 'airforce') {
        document.getElementById('airforceGameOverlay').classList.add('active');
        const airforceNameInput = document.getElementById('airforcePlayerNameInput');
        const airforceStartScreen = document.getElementById('airforceStartScreen');
        const airforceGameOverOverlay = document.getElementById('airforceGameOverOverlay');
        const airforceNameHint = document.getElementById('airforcePlayerNameHint');
        const storedName = getStoredAirforcePlayerName();
        if (airforceNameInput) airforceNameInput.value = storedName;
        if (airforceNameHint) airforceNameHint.classList.add('hidden');
        if (airforceGameOverOverlay) airforceGameOverOverlay.classList.add('hidden');
        if (airforceStartScreen) airforceStartScreen.classList.remove('hidden');
        loadLeaderboard('airforce', leaderboardUnits.airforce);
    } else if (gameType === 'chess') {
        document.getElementById('chessGameOverlay').classList.add('active');
        if (typeof window.prepareChessOverlay === 'function') {
            window.prepareChessOverlay();
        }
    } else if (gameType === 'carrom') {
        document.getElementById('carromGameOverlay').classList.add('active');
        if (typeof window.prepareCarromOverlay === 'function') {
            window.prepareCarromOverlay();
        }
    }
};

function loadLeaderboard(gameId, unit) {
    const listEl = document.getElementById(`${gameId}LeaderboardList`);
    if (!listEl) return;

    const gameBoardRef = dbRef(db, `leaderboards/${gameId}`);
    onValue(gameBoardRef, (snapshot) => {
        const data = snapshot.val();
        listEl.innerHTML = '';

        if (!data) {
            listEl.innerHTML = '<li class="text-center text-gray-400 text-sm">No high scores yet! Be the first!</li>';
            return;
        }

        Object.values(data)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .forEach((item, index) => {
                const playerDisplayName = (item && item.name ? String(item.name) : 'Unknown Pilot').trim() || 'Unknown Pilot';
                const li = document.createElement('li');
                li.className = `rank-${index + 1}`;
                li.innerHTML = `<span>#${index + 1} ${playerDisplayName}</span> <span>${item.score} ${unit}</span>`;
                listEl.appendChild(li);
            });
    }, { onlyOnce: true });
}

window.saveLeaderboardScore = function (gameId, name, score) {
    const gameBoardRef = dbRef(db, `leaderboards/${gameId}`);
    push(gameBoardRef, {
        name: name || 'Player',
        score,
        date: Date.now()
    });
    loadLeaderboard(gameId, leaderboardUnits[gameId] || '');
};

function checkAndSaveScore(gameId, newScore) {
    let playerName = 'Player';
    if (gameId === 'airforce') {
        playerName = getStoredAirforcePlayerName() || 'Player';
    } else {
        try {
            const user = JSON.parse(localStorage.getItem('loggedInUser'));
            if (user && user.name) playerName = user.name;
        } catch (error) {
            console.warn('Unable to read logged in user for leaderboard save.', error);
        }
    }
    window.saveLeaderboardScore(gameId, playerName, newScore);
}

let bounceCanvas, bounceCtx;
let bounceInterval;
let gameOverBounce = false;
let isBouncePaused = false;
let bounceScore = 0;

// Level System
let bounceLevel = 'easy';
const bounceLevels = {
    easy: { speed: 4, paddleWidth: 120, pointMultiplier: 1, shrinkRate: 1, speedUp: 0.3, color: '#4ade80', label: 'Easy — 1x pts', ballColor: '#86efac', paddleColor: '#4ade80', borderColor: '#4ade80', bgColor: '#0a1f0a' },
    medium: { speed: 8, paddleWidth: 90, pointMultiplier: 2, shrinkRate: 2, speedUp: 0.6, color: '#facc15', label: 'Medium — 2x pts', ballColor: '#22c55e', paddleColor: '#16a34a', borderColor: '#16a34a', bgColor: '#0a170a' },
    hard: { speed: 14, paddleWidth: 45, pointMultiplier: 5, shrinkRate: 4, speedUp: 1.2, color: '#f87171', label: 'Hard — 5x pts \ud83d\udd25', ballColor: '#15803d', paddleColor: '#166534', borderColor: '#14532d', bgColor: '#030f03' }
};

const ball = {
    x: 200,
    y: 200,
    radius: 10,
    dx: 4,
    dy: -4,
    speed: 4,
    color: '#06b6d4' // cyan-500
};

const paddle = {
    width: 100,
    height: 14,
    x: 200,
    y: 470,
    dx: 10,
    color: '#0ea5e9' // sky-500
};

let rightPressed = false;
let leftPressed = false;

window.setBounceLevel = function (level) {
    bounceLevel = level;
    const info = bounceLevels[level];

    // Update UI highlights
    ['bounceEasyBtn', 'bounceMediumBtn', 'bounceHardBtn'].forEach(id => {
        document.getElementById(id).classList.remove('ring-2', 'ring-green-400', 'ring-yellow-400', 'ring-red-400');
        document.getElementById(id).classList.add('ring-0');
    });

    const btnId = level === 'easy' ? 'bounceEasyBtn' : level === 'medium' ? 'bounceMediumBtn' : 'bounceHardBtn';
    const ringColor = level === 'easy' ? 'ring-green-400' : level === 'medium' ? 'ring-yellow-400' : 'ring-red-400';
    document.getElementById(btnId).classList.remove('ring-0');
    document.getElementById(btnId).classList.add('ring-2', ringColor);

    // Update info text
    const infoElem = document.getElementById('bounceLevelInfo');
    infoElem.textContent = info.label;
    infoElem.style.color = info.color;

    // Update canvas border color to match level theme
    const canvas = document.getElementById('bounceCanvas');
    if (canvas) {
        canvas.style.borderColor = info.borderColor;
    }

    // Auto-restart game with new level settings
    window.startBounceGame();
}

window.startBounceGame = function () {
    bounceCanvas = document.getElementById('bounceCanvas');
    bounceCtx = bounceCanvas.getContext('2d');

    const levelConfig = bounceLevels[bounceLevel];

    // Reset State based on level
    ball.x = bounceCanvas.width / 2;
    ball.y = bounceCanvas.height / 2;
    ball.speed = levelConfig.speed;
    ball.dx = (Math.random() > 0.5 ? 1 : -1) * ball.speed;
    ball.dy = -ball.speed;
    ball.color = levelConfig.ballColor;

    paddle.width = levelConfig.paddleWidth;
    paddle.color = levelConfig.paddleColor;
    paddle.x = (bounceCanvas.width - paddle.width) / 2;

    bounceScore = 0;
    gameOverBounce = false;
    isBouncePaused = false;
    rightPressed = false;
    leftPressed = false;

    document.getElementById('bounceScore').textContent = bounceScore;
    document.getElementById('bouncePauseOverlay').classList.add('hidden');
    document.getElementById('bounceGameOverOverlay').classList.add('hidden');

    if (bounceInterval) clearInterval(bounceInterval);
    bounceInterval = setInterval(drawBounceGame, 16); // ~60fps
}

window.toggleBouncePause = function () {
    if (gameOverBounce || !bounceInterval) return;

    isBouncePaused = !isBouncePaused;
    const overlay = document.getElementById('bouncePauseOverlay');

    if (isBouncePaused) {
        clearInterval(bounceInterval);
        overlay.classList.remove('hidden');
    } else {
        bounceInterval = setInterval(drawBounceGame, 16);
        overlay.classList.add('hidden');
    }
}

function drawBall() {
    bounceCtx.beginPath();
    bounceCtx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    bounceCtx.fillStyle = ball.color;
    bounceCtx.fill();
    bounceCtx.closePath();
}

function drawPaddle() {
    bounceCtx.beginPath();
    bounceCtx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 6);
    bounceCtx.fillStyle = paddle.color;
    bounceCtx.fill();
    bounceCtx.closePath();
}

function drawBounceGame() {
    if (gameOverBounce || isBouncePaused) return;

    bounceCtx.fillStyle = bounceLevels[bounceLevel].bgColor;
    bounceCtx.fillRect(0, 0, bounceCanvas.width, bounceCanvas.height);

    drawBall();
    drawPaddle();

    // Wall Collision (Left & Right)
    if (ball.x + ball.dx > bounceCanvas.width - ball.radius || ball.x + ball.dx < ball.radius) {
        ball.dx = -ball.dx;
    }

    // Wall Collision (Top)
    if (ball.y + ball.dy < ball.radius) {
        ball.dy = -ball.dy;
    }
    // Paddle Collision or Bottom Edge
    else if (ball.y + ball.dy + ball.radius >= paddle.y) {
        // Check if ball is within paddle's horizontal range
        if (ball.x + ball.radius > paddle.x && ball.x - ball.radius < paddle.x + paddle.width) {

            // Rebound physics
            let hitPoint = ball.x - (paddle.x + paddle.width / 2);
            let normalizedHit = hitPoint / (paddle.width / 2); // -1 to 1

            ball.dy = -Math.abs(ball.dy); // Always bounce UP
            ball.dx = normalizedHit * ball.speed * 1.2;

            const levelConfig = bounceLevels[bounceLevel];
            bounceScore += levelConfig.pointMultiplier;
            document.getElementById('bounceScore').textContent = bounceScore;

            if (bounceScore % (5 * levelConfig.pointMultiplier) === 0) {
                ball.speed += levelConfig.speedUp;
                const currentSpeedSq = ball.dx * ball.dx + ball.dy * ball.dy;
                const speedScale = ball.speed / Math.sqrt(currentSpeedSq);
                ball.dx *= speedScale;
                ball.dy *= speedScale;

                if (paddle.width > 40) paddle.width -= levelConfig.shrinkRate;
            }
            // Clamp ball above paddle to prevent pass-through
            ball.y = paddle.y - ball.radius;

        } else if (ball.y + ball.dy > bounceCanvas.height - ball.radius) {
            // Ball missed paddle and hit the bottom — Game Over
            gameOverBounce = true;
            clearInterval(bounceInterval);

            document.getElementById('bounceFinalScore').textContent = bounceScore;
            document.getElementById('bounceGameOverOverlay').classList.remove('hidden');

            checkAndSaveScore('bounce', bounceScore, true);
            return;
        }
    }

    // Move Ball
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Move Paddle
    if (rightPressed && paddle.x < bounceCanvas.width - paddle.width) {
        paddle.x += paddle.dx;
    } else if (leftPressed && paddle.x > 0) {
        paddle.x -= paddle.dx;
    }
}

document.addEventListener("mousemove", function (e) {
    const overlay = document.getElementById('bounceGameOverlay');
    if (!overlay || !overlay.classList.contains('active') || isBouncePaused || gameOverBounce) return;

    if (bounceCanvas) {
        const rect = bounceCanvas.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;

        if (relativeX > 0 && relativeX < bounceCanvas.width) {
            paddle.x = relativeX - paddle.width / 2;
            if (paddle.x < 0) paddle.x = 0;
            if (paddle.x + paddle.width > bounceCanvas.width) paddle.x = bounceCanvas.width - paddle.width;
        }
    }
});

document.addEventListener("keydown", function (e) {
    const overlay = document.getElementById('bounceGameOverlay');
    if (!overlay || !overlay.classList.contains('active')) return;

    if (e.code === 'Space') {
        e.preventDefault();
        window.toggleBouncePause();
        return;
    }

    if (isBouncePaused || gameOverBounce) return;

    if (e.key === "Right" || e.key === "ArrowRight") rightPressed = true;
    else if (e.key === "Left" || e.key === "ArrowLeft") leftPressed = true;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) > -1) {
        e.preventDefault();
    }
});

document.addEventListener("keyup", function (e) {
    if (e.key === "Right" || e.key === "ArrowRight") rightPressed = false;
    else if (e.key === "Left" || e.key === "ArrowLeft") leftPressed = false;
});


// ========================================

// ========================================
// 🚀 Quick Links - Open All Regular Links
// ========================================
window.openQuickLinks = function () {
    const password = prompt('🔒 Enter Password to open Quick Links:');
    if (password !== 'shivangpb') {
        if (password !== null) alert('❌ Wrong Password!');
        return;
    }

    // chrome://flags - copy to clipboard first
    try {
        navigator.clipboard.writeText('chrome://flags/');
        alert('✅ "chrome://flags/" copied to clipboard!\nPaste it in a new tab.\n\nAll other links will now open.');
    } catch (e) {
        prompt('⚠️ Copy this URL manually and paste in a new tab:', 'chrome://flags/');
    }

    const links = [
        'https://bms.policybazaar.com/dashboardV3',
        'https://chatinternal.policybazaar.com/channel/6854fee0f93b60e3e7de14ca',
        'https://ntqueprince.github.io/CVANG_VAHAN/',
        'https://ntqueprince.github.io/textbook/',
        'https://twinternal.policybazaar.com/panel/UpdateOwnership.aspx',
        'https://docs.google.com/forms/d/e/1FAIpQLSc4d0d6mvWinEQj7F-qZzIZzfg_IWffTPMB9d517tiIGwj6kQ/viewform',
        'https://docs.google.com/forms/d/e/1FAIpQLSfjP44jAJnIEPBMq6wugjLBWthfQ3sYtiiMC8H-2-dnN20Qvg/viewform',
        'https://docs.google.com/forms/d/e/1FAIpQLScMAFtPmR4C3GtqCCz2meIJessXmFePOlUhqb0jRFZnMcrUvA/viewform',
        'https://docs.google.com/forms/d/e/1FAIpQLScliXNbSsS85LhQiiFDkQXGBgJIHon2ByR9Wm0X9j4BUqedVg/formResponse',
        'https://pbconnect.policybazaar.com/home',
        'https://www.pbwheels.com/'
    ];

    // Open all links with slight delay to avoid popup blocker
    links.forEach((url, i) => {
        setTimeout(() => {
            window.open(url, '_blank');
        }, i * 300);
    });
};

// =========================================================
// ✈️ AIR FORCE SHOOTER GAME — Full Canvas Game Engine
// =========================================================
(function () {
    'use strict';

    let CW = 480, CH = 600;
    let canvas, ctx, animFrame;
    let gameRunning = false;
    let score, lives, currentLevel, kills, highScore;
    let player, bullets, enemies, particles, powerups, stars;
    let keysDown = {};
    let autoFireTimer = 0;

    // Audio Context
    let bgmAudioCtx = null;
    function playAirforceSound(type) {
        if (!bgmAudioCtx) {
            bgmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (bgmAudioCtx.state === 'suspended') bgmAudioCtx.resume();

        let osc = bgmAudioCtx.createOscillator();
        let gain = bgmAudioCtx.createGain();
        osc.connect(gain);
        gain.connect(bgmAudioCtx.destination);

        let now = bgmAudioCtx.currentTime;

        if (type === 'shoot') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
            gain.gain.setValueAtTime(0.02, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'explosion') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'powerup') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(800, now + 0.1);
            osc.frequency.linearRampToValueAtTime(1200, now + 0.2);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'gameover') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 1.0);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
            osc.start(now);
            osc.stop(now + 1.0);
        }
    }
    let rapidFireEnd = 0;
    let shieldEnd = 0;
    let magnetEnd = 0;
    let enemySpawnTimer = 0;
    let waveEnemiesLeft = 0;
    let waveEnemiesTotal = 0;
    let waveResolved = 0;
    let waveTransition = 0;
    let frameCount = 0;

    // Ranks
    const RANKS = [
        { score: 0, name: 'Cadet' },
        { score: 500, name: 'Lieutenant' },
        { score: 1500, name: 'Captain' },
        { score: 3000, name: 'Major' },
        { score: 5000, name: 'Colonel' },
        { score: 8000, name: 'General' },
        { score: 12000, name: 'Air Marshal' },
        { score: 20000, name: 'Supreme Commander' }
    ];
    const AIRFORCE_THEMES = [
        { name: 'Dawn Breaker', mission: 'Pierce the low-cloud patrol line.', skyTop: '#061626', skyBottom: '#144a74', accent: '#38bdf8', secondary: '#8b5cf6', star: '#dbeafe', haze: 'rgba(56,189,248,0.18)' },
        { name: 'Solar Drift', mission: 'Slide through a blazing sunrise canyon.', skyTop: '#2a1304', skyBottom: '#8a3412', accent: '#fb923c', secondary: '#facc15', star: '#fde68a', haze: 'rgba(251,146,60,0.16)' },
        { name: 'Ion Stream', mission: 'Cut across an electric storm front.', skyTop: '#07172f', skyBottom: '#1d4ed8', accent: '#60a5fa', secondary: '#22d3ee', star: '#dbeafe', haze: 'rgba(34,211,238,0.16)' },
        { name: 'Crimson Run', mission: 'Break a hostile red alert blockade.', skyTop: '#22070c', skyBottom: '#7f1d1d', accent: '#fb7185', secondary: '#f97316', star: '#ffe4e6', haze: 'rgba(251,113,133,0.16)' },
        { name: 'Nebula Crown', mission: 'Hold formation inside a violet nebula.', skyTop: '#180530', skyBottom: '#5b21b6', accent: '#a78bfa', secondary: '#f472b6', star: '#ede9fe', haze: 'rgba(167,139,250,0.18)' },
        { name: 'Tempest Core', mission: 'Thread a volatile thunder corridor.', skyTop: '#06131f', skyBottom: '#0f766e', accent: '#2dd4bf', secondary: '#38bdf8', star: '#ccfbf1', haze: 'rgba(45,212,191,0.16)' },
        { name: 'Night Raid', mission: 'Engage stealth craft in blackout airspace.', skyTop: '#020617', skyBottom: '#172554', accent: '#818cf8', secondary: '#38bdf8', star: '#cbd5e1', haze: 'rgba(129,140,248,0.15)' },
        { name: 'Aurora Spear', mission: 'Drive through polar curtains and split the fleet.', skyTop: '#042f2e', skyBottom: '#0f766e', accent: '#5eead4', secondary: '#93c5fd', star: '#d1fae5', haze: 'rgba(94,234,212,0.18)' },
        { name: 'Voidfall', mission: 'Survive the dark-sky gauntlet.', skyTop: '#020617', skyBottom: '#111827', accent: '#f472b6', secondary: '#a78bfa', star: '#e5e7eb', haze: 'rgba(244,114,182,0.14)' },
        { name: 'Crown Siege', mission: 'Destroy the command armada and own the sky.', skyTop: '#140c1f', skyBottom: '#3b0764', accent: '#facc15', secondary: '#38bdf8', star: '#fef3c7', haze: 'rgba(250,204,21,0.18)' }
    ];

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function getRank(s) {
        let r = RANKS[0].name;
        for (let i = 0; i < RANKS.length; i++) {
            if (s >= RANKS[i].score) r = RANKS[i].name;
        }
        return r;
    }

    function getAirforceTheme(level) {
        return AIRFORCE_THEMES[Math.max(0, Math.min(AIRFORCE_THEMES.length - 1, level - 1))];
    }

    function updateAirforceThemeUI() {
        const theme = getAirforceTheme(currentLevel);
        const canvasEl = document.getElementById('airforceCanvas');
        const themeNameEl = document.getElementById('airforceThemeName');
        const sectorLabelEl = document.getElementById('airforceSectorLabel');
        const missionTextEl = document.getElementById('airforceMissionText');
        const progressLabelEl = document.getElementById('airforceProgressLabel');
        const progressBarEl = document.getElementById('airforceProgressBar');
        const boostsEl = document.getElementById('airforceBoosts');

        if (canvasEl) {
            canvasEl.style.borderColor = theme.accent;
            canvasEl.style.boxShadow = `0 24px 70px ${theme.haze}`;
        }
        if (themeNameEl) themeNameEl.textContent = theme.name;
        if (sectorLabelEl) sectorLabelEl.textContent = `Sector ${currentLevel} / 10`;
        if (missionTextEl) missionTextEl.textContent = theme.mission;
        if (progressLabelEl) progressLabelEl.textContent = `${waveResolved} / ${waveEnemiesTotal}`;
        if (progressBarEl) {
            const progress = waveEnemiesTotal ? Math.min(100, (waveResolved / waveEnemiesTotal) * 100) : 0;
            progressBarEl.style.width = `${progress}%`;
            progressBarEl.style.background = `linear-gradient(90deg, ${theme.accent}, ${theme.secondary})`;
        }
        if (boostsEl) {
            const states = [];
            const now = Date.now();
            if (shieldEnd > now) states.push(`Shield ${Math.ceil((shieldEnd - now) / 1000)}s`);
            if (rapidFireEnd > now) states.push(`Rapid ${Math.ceil((rapidFireEnd - now) / 1000)}s`);
            if (magnetEnd > now) states.push(`Magnet ${Math.ceil((magnetEnd - now) / 1000)}s`);
            boostsEl.textContent = states.length ? states.join(' | ') : 'Weapons nominal';
        }
    }

    // Colors
    const COLORS = {
        player: '#06b6d4',
        playerGlow: 'rgba(6,182,212,0.3)',
        bullet: '#fbbf24',
        enemyBullet: '#ef4444',
        enemy1: '#ef4444',
        enemy2: '#f97316',
        enemy3: '#8b5cf6',
        boss: '#dc2626',
        kamikaze: '#f59e0b',
        shield: 'rgba(6,182,212,0.25)',
        explosion: ['#fbbf24', '#ef4444', '#f97316', '#fff', '#06b6d4']
    };

    // Init stars for scrolling background
    function initStars() {
        const theme = getAirforceTheme(currentLevel);
        stars = [];
        for (let i = 0; i < 90; i++) {
            stars.push({
                x: Math.random() * CW,
                y: Math.random() * CH,
                s: Math.random() * 2 + 0.5,
                speed: Math.random() * 1.45 + 0.5,
                alpha: Math.random() * 0.5 + 0.25,
                tint: theme.star
            });
        }
    }

    function updateStars() {
        for (let i = 0; i < stars.length; i++) {
            stars[i].y += stars[i].speed;
            stars[i].x += Math.sin((frameCount + i * 7) * 0.01) * 0.06;
            if (stars[i].y > CH) {
                stars[i].y = 0;
                stars[i].x = Math.random() * CW;
            }
        }
    }

    function drawStars() {
        const theme = getAirforceTheme(currentLevel);
        const gradient = ctx.createLinearGradient(0, 0, 0, CH);
        gradient.addColorStop(0, theme.skyTop);
        gradient.addColorStop(1, theme.skyBottom);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CW, CH);

        ctx.fillStyle = theme.haze;
        ctx.beginPath();
        ctx.arc(CW * 0.25, 110, 90 + Math.sin(frameCount * 0.02) * 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(CW * 0.78, 180, 130 + Math.cos(frameCount * 0.015) * 10, 0, Math.PI * 2);
        ctx.fill();

        for (let i = 0; i < stars.length; i++) {
            let s = stars[i];
            ctx.fillStyle = s.tint || theme.star;
            ctx.globalAlpha = s.alpha || (0.3 + s.s * 0.2);
            ctx.fillRect(s.x, s.y, s.s, s.s);
        }
        ctx.globalAlpha = 1;
    }

    // Player
    function createPlayer() {
        return {
            x: CW / 2,
            y: CH - 70,
            w: 36,
            h: 40,
            speed: 3.55,
            invincible: 0
        };
    }

    function drawPlayer() {
        let p = player;
        let px = p.x, py = p.y;

        // Invincibility flash
        if (p.invincible > 0 && Math.floor(frameCount / 4) % 2 === 0) return;

        // Shield aura
        if (shieldEnd > Date.now()) {
            ctx.beginPath();
            ctx.arc(px, py - 5, 30, 0, Math.PI * 2);
            ctx.fillStyle = COLORS.shield;
            ctx.fill();
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Engine glow
        ctx.beginPath();
        ctx.ellipse(px, py + 18, 6, 12 + Math.sin(frameCount * 0.3) * 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(px, py + 15, 3, 6 + Math.sin(frameCount * 0.5) * 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        // Jet body
        ctx.beginPath();
        ctx.moveTo(px, py - 22);        // nose
        ctx.lineTo(px - 6, py - 8);     // left inner
        ctx.lineTo(px - 18, py + 14);   // left wing tip
        ctx.lineTo(px - 8, py + 10);    // left wing inner
        ctx.lineTo(px - 6, py + 18);    // left tail
        ctx.lineTo(px, py + 14);        // bottom center
        ctx.lineTo(px + 6, py + 18);    // right tail
        ctx.lineTo(px + 8, py + 10);    // right wing inner
        ctx.lineTo(px + 18, py + 14);   // right wing tip
        ctx.lineTo(px + 6, py - 8);     // right inner
        ctx.closePath();
        ctx.fillStyle = COLORS.player;
        ctx.fill();
        ctx.strokeStyle = '#0e7490';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Cockpit
        ctx.beginPath();
        ctx.ellipse(px, py - 6, 4, 7, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#164e63';
        ctx.fill();

        // Rapid fire indicator
        if (rapidFireEnd > Date.now()) {
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('⚡', px, py - 28);
        }
    }

    function updatePlayer() {
        let p = player;
        let sp = p.speed;
        if (keysDown['ArrowLeft'] || keysDown['a']) p.x -= sp;
        if (keysDown['ArrowRight'] || keysDown['d']) p.x += sp;
        if (keysDown['ArrowUp'] || keysDown['w']) p.y -= sp;
        if (keysDown['ArrowDown'] || keysDown['s']) p.y += sp;
        // Clamp
        p.x = Math.max(20, Math.min(CW - 20, p.x));
        p.y = Math.max(30, Math.min(CH - 30, p.y));
        if (p.invincible > 0) p.invincible--;
    }

    // Bullets
    function shoot() {
        let rapid = rapidFireEnd > Date.now();
        let bSpeed = -6.6;
        bullets.push({ x: player.x, y: player.y - 22, w: 3, h: 10, speed: bSpeed, type: 'player' });
        if (rapid) {
            bullets.push({ x: player.x - 10, y: player.y - 15, w: 3, h: 8, speed: bSpeed, type: 'player' });
            bullets.push({ x: player.x + 10, y: player.y - 15, w: 3, h: 8, speed: bSpeed, type: 'player' });
        }
        if (bullets.length > 220) bullets.splice(0, bullets.length - 220);
        playAirforceSound('shoot');
    }

    function updateBullets() {
        for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i];
            if (b.type === 'enemy') {
                if (b.trail) {
                    b.trail.unshift({ x: b.x, y: b.y });
                    if (b.trail.length > 6) b.trail.pop();
                }
                b.pulse = (b.pulse || 0) + 0.22;
                b.x += b.vx || 0;
                b.y += b.vy !== undefined ? b.vy : b.speed;
            } else {
                b.y += b.speed;
            }
            if (b.y < -10 || b.y > CH + 10 || b.x < -10 || b.x > CW + 10) {
                bullets.splice(i, 1);
            }
        }
    }

    function drawBullets() {
        for (let i = 0; i < bullets.length; i++) {
            let b = bullets[i];
            if (b.type === 'player') {
                ctx.fillStyle = COLORS.bullet;
                ctx.shadowColor = '#fbbf24';
                ctx.shadowBlur = 6;
                ctx.fillRect(b.x - b.w / 2, b.y, b.w, b.h);
                ctx.shadowBlur = 0;
            } else {
                const radius = b.radius || 5;
                const dangerColor = b.color || '#fb7185';
                const outerColor = b.outerColor || '#f97316';
                if (b.trail && b.trail.length > 1) {
                    for (let t = 0; t < b.trail.length; t++) {
                        const node = b.trail[t];
                        const alpha = (1 - t / b.trail.length) * 0.35;
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, Math.max(1.2, radius - t * 0.7), 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(251, 113, 133, ${alpha})`;
                        ctx.fill();
                    }
                }
                ctx.shadowColor = outerColor;
                ctx.shadowBlur = 14;
                ctx.fillStyle = outerColor;
                ctx.beginPath();
                ctx.arc(b.x, b.y, radius + 1.8 + Math.sin(b.pulse || 0) * 0.8, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = dangerColor;
                ctx.beginPath();
                ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.92)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(b.x, b.y, Math.max(2, radius - 1.8), 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    // Enemies
    const LEVEL_SPEED_MULT = [0, 0.36, 0.43, 0.5, 0.57, 0.63, 0.69, 0.75, 0.81, 0.87, 0.93]; // roughly 50% overall pace
    const LEVEL_SPAWN_MULT = [0, 2.84, 2.48, 2.16, 1.88, 1.64, 1.44, 1.28, 1.12, 1.0, 0.88]; // slower wave pacing

    function spawnEnemy() {
        let types = ['fighter', 'bomber'];
        if (currentLevel >= 3) types.push('kamikaze');
        if (currentLevel >= 4) types.push('stealth');
        if (currentLevel >= 6) types.push('stealth', 'kamikaze');
        if (currentLevel >= 8 && Math.random() < (0.035 + currentLevel * 0.016)) types.push('boss');

        let type = types[Math.floor(Math.random() * types.length)];
        let mult = LEVEL_SPEED_MULT[currentLevel];
        let e = {
            x: Math.random() * (CW - 60) + 30,
            y: -40,
            type: type,
            hp: 1,
            speed: (1.5 + currentLevel * 0.2) * mult,
            shootTimer: 0,
            w: 28,
            h: 28,
            angle: 0,
            drift: 0.65 + Math.random() * 1.15,
            phase: Math.random() * Math.PI * 2
        };

        if (type === 'bomber') { e.hp = 3; e.speed = 1 * mult; e.w = 34; e.h = 34; }
        else if (type === 'stealth') { e.hp = 2; e.speed = 2.5 * mult; }
        else if (type === 'boss') { e.hp = 10 + currentLevel * 4; e.speed = 0.8 * mult; e.w = 50; e.h = 50; }
        else if (type === 'kamikaze') { e.hp = 1; e.speed = (3 + currentLevel * 0.3) * mult; }

        enemies.push(e);
    }

    function updateEnemies() {
        let now = Date.now();
        for (let i = enemies.length - 1; i >= 0; i--) {
            let e = enemies[i];

            if (e.type === 'kamikaze') {
                // Chase player
                let dx = player.x - e.x;
                let dy = player.y - e.y;
                let dist = Math.sqrt(dx * dx + dy * dy) || 1;
                e.x += (dx / dist) * Math.min(e.speed, 3.6);
                e.y += (dy / dist) * e.speed;
                e.angle = Math.atan2(dy, dx) + Math.PI / 2;
            } else if (e.type === 'stealth') {
                // Zigzag
                e.y += e.speed;
                e.x += Math.sin(frameCount * 0.05 + e.phase) * (1.6 + e.drift);
            } else {
                e.y += e.speed;
                e.x += Math.sin(frameCount * 0.02 + e.phase) * e.drift;
            }

            const edgePadding = e.w / 2 + 8;
            e.x = clamp(e.x, edgePadding, CW - edgePadding);

            // Enemy shooting (not kamikaze)
            if (e.type !== 'kamikaze' && e.y > 50 && e.y < CH - 100) {
                e.shootTimer++;
                let fireRate = e.type === 'boss' ? 56 : (e.type === 'bomber' ? 140 : 192);
                if (e.shootTimer >= fireRate) {
                    e.shootTimer = 0;
                    let dx2 = player.x - e.x;
                    let dy2 = player.y - e.y;
                    let d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
                    const enemyShotSpeed = (e.type === 'boss' ? 2.75 : (e.type === 'bomber' ? 2.225 : 1.9)) + currentLevel * 0.045;
                    const bulletRadius = e.type === 'boss' ? 6 : (e.type === 'bomber' ? 5 : 4);
                    bullets.push({
                        x: e.x,
                        y: e.y + e.h / 2,
                        w: bulletRadius * 2,
                        h: bulletRadius * 2,
                        speed: enemyShotSpeed,
                        vx: (dx2 / d2) * enemyShotSpeed,
                        vy: (dy2 / d2) * enemyShotSpeed,
                        radius: bulletRadius,
                        pulse: Math.random() * Math.PI * 2,
                        trail: [],
                        color: e.type === 'boss' ? '#f43f5e' : '#fb7185',
                        outerColor: e.type === 'boss' ? '#f97316' : '#fb923c',
                        type: 'enemy'
                    });
                    if (e.type === 'boss') {
                        // Boss shoots triple
                        bullets.push({
                            x: e.x - 15, y: e.y + e.h / 2, w: 12, h: 12, speed: 4.7, vx: -0.8, vy: 4.6,
                            radius: 5.2, pulse: Math.random() * Math.PI * 2, trail: [],
                            color: '#fb7185', outerColor: '#facc15', type: 'enemy'
                        });
                        bullets.push({
                            x: e.x + 15, y: e.y + e.h / 2, w: 12, h: 12, speed: 4.7, vx: 0.8, vy: 4.6,
                            radius: 5.2, pulse: Math.random() * Math.PI * 2, trail: [],
                            color: '#fb7185', outerColor: '#facc15', type: 'enemy'
                        });
                    }
                    if (bullets.length > 220) bullets.splice(0, bullets.length - 220);
                }
            }

            // Remove if off screen
            if (e.y > CH + 50) {
                waveResolved = Math.min(waveEnemiesTotal, waveResolved + 1);
                enemies.splice(i, 1);
            }
        }
    }

    function drawEnemy(e) {
        let ex = e.x, ey = e.y;
        ctx.save();
        if (e.type === 'kamikaze') {
            ctx.translate(ex, ey);
            ctx.rotate(e.angle || 0);
            ctx.translate(-ex, -ey);
        }
        if (e.type === 'fighter') {
            // Small red jet
            ctx.beginPath();
            ctx.moveTo(ex, ey + 16);
            ctx.lineTo(ex - 5, ey + 4);
            ctx.lineTo(ex - 14, ey - 10);
            ctx.lineTo(ex - 6, ey - 6);
            ctx.lineTo(ex, ey - 16);
            ctx.lineTo(ex + 6, ey - 6);
            ctx.lineTo(ex + 14, ey - 10);
            ctx.lineTo(ex + 5, ey + 4);
            ctx.closePath();
            ctx.fillStyle = COLORS.enemy1;
            ctx.fill();
            ctx.strokeStyle = '#991b1b';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (e.type === 'bomber') {
            // Fat orange bomber
            ctx.beginPath();
            ctx.moveTo(ex, ey + 18);
            ctx.lineTo(ex - 10, ey + 6);
            ctx.lineTo(ex - 20, ey - 8);
            ctx.lineTo(ex - 8, ey - 4);
            ctx.lineTo(ex, ey - 18);
            ctx.lineTo(ex + 8, ey - 4);
            ctx.lineTo(ex + 20, ey - 8);
            ctx.lineTo(ex + 10, ey + 6);
            ctx.closePath();
            ctx.fillStyle = COLORS.enemy2;
            ctx.fill();
            ctx.strokeStyle = '#9a3412';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (e.type === 'stealth') {
            // Purple stealth - semi transparent
            ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.1) * 0.3;
            ctx.beginPath();
            ctx.moveTo(ex, ey + 14);
            ctx.lineTo(ex - 16, ey - 6);
            ctx.lineTo(ex, ey - 14);
            ctx.lineTo(ex + 16, ey - 6);
            ctx.closePath();
            ctx.fillStyle = COLORS.enemy3;
            ctx.fill();
            ctx.globalAlpha = 1;
        } else if (e.type === 'boss') {
            // Big red boss
            ctx.beginPath();
            ctx.moveTo(ex, ey + 28);
            ctx.lineTo(ex - 14, ey + 10);
            ctx.lineTo(ex - 28, ey - 5);
            ctx.lineTo(ex - 18, ey - 15);
            ctx.lineTo(ex, ey - 28);
            ctx.lineTo(ex + 18, ey - 15);
            ctx.lineTo(ex + 28, ey - 5);
            ctx.lineTo(ex + 14, ey + 10);
            ctx.closePath();
            ctx.fillStyle = COLORS.boss;
            ctx.fill();
            ctx.strokeStyle = '#7f1d1d';
            ctx.lineWidth = 2;
            ctx.stroke();
            // HP bar
            let hpW = 40;
            let maxHp = 10 + currentLevel * 4;
            ctx.fillStyle = '#374151';
            ctx.fillRect(ex - hpW / 2, ey - 35, hpW, 4);
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(ex - hpW / 2, ey - 35, hpW * (e.hp / maxHp), 4);
        } else if (e.type === 'kamikaze') {
            // Yellow triangle
            ctx.beginPath();
            ctx.moveTo(ex, ey - 14);
            ctx.lineTo(ex - 10, ey + 12);
            ctx.lineTo(ex + 10, ey + 12);
            ctx.closePath();
            ctx.fillStyle = COLORS.kamikaze;
            ctx.fill();
            // Engine trail
            ctx.beginPath();
            ctx.arc(ex, ey + 16, 4 + Math.sin(frameCount * 0.4) * 2, 0, Math.PI * 2);
            ctx.fillStyle = '#fbbf24';
            ctx.fill();
        }
        ctx.restore();
    }

    function drawEnemies() {
        for (let i = 0; i < enemies.length; i++) {
            drawEnemy(enemies[i]);
        }
    }

    // Particles
    function spawnExplosion(x, y, count, colors) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: 25 + Math.random() * 20,
                maxLife: 45,
                size: 2 + Math.random() * 4,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96;
            p.vy *= 0.96;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (let i = 0; i < particles.length; i++) {
            let p = particles[i];
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // Power-ups
    function spawnPowerup(x, y) {
        let types = ['shield', 'rapid', 'bomb', 'magnet', 'life'];
        let t = types[Math.floor(Math.random() * types.length)];
        let emojis = { shield: '🛡️', rapid: '⚡', bomb: '💣', magnet: '🧲', life: '❤️' };
        powerups.push({
            x: x, y: y, type: t,
            emoji: emojis[t],
            speed: 1.5, size: 16,
            glow: 0
        });
    }

    function updatePowerups() {
        for (let i = powerups.length - 1; i >= 0; i--) {
            let pu = powerups[i];
            pu.y += pu.speed;
            pu.glow += 0.1;

            // Magnet effect
            if (magnetEnd > Date.now()) {
                let dx = player.x - pu.x;
                let dy = player.y - pu.y;
                let d = Math.sqrt(dx * dx + dy * dy) || 1;
                if (d < 200) {
                    pu.x += (dx / d) * 3;
                    pu.y += (dy / d) * 3;
                }
            }

            // Collect
            let dx = player.x - pu.x;
            let dy = player.y - pu.y;
            if (Math.sqrt(dx * dx + dy * dy) < 25) {
                collectPowerup(pu);
                powerups.splice(i, 1);
                continue;
            }

            if (pu.y > CH + 20) powerups.splice(i, 1);
        }
    }

    function collectPowerup(pu) {
        let now = Date.now();
        if (pu.type === 'shield') {
            shieldEnd = now + 8000;
        } else if (pu.type === 'rapid') {
            rapidFireEnd = now + 6000;
        } else if (pu.type === 'bomb') {
            // Kill all enemies on screen
            for (let i = enemies.length - 1; i >= 0; i--) {
                let e = enemies[i];
                spawnExplosion(e.x, e.y, 10, COLORS.explosion);
                score += e.type === 'boss' ? 50 : 10;
                kills++;
            }
            enemies = [];
            // Big explosion flash
            spawnExplosion(CW / 2, CH / 2, 30, ['#fff', '#fbbf24']);
            playAirforceSound('explosion');
        } else if (pu.type === 'magnet') {
            magnetEnd = now + 10000;
        } else if (pu.type === 'life') {
            lives = Math.min(lives + 1, 5);
        }
        spawnExplosion(pu.x, pu.y, 8, ['#fff', '#fbbf24', '#06b6d4']);
        playAirforceSound('powerup');
    }

    function drawPowerups() {
        for (let i = 0; i < powerups.length; i++) {
            let pu = powerups[i];
            // Glow circle
            ctx.beginPath();
            ctx.arc(pu.x, pu.y, pu.size + 4 + Math.sin(pu.glow) * 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(251,191,36,0.15)';
            ctx.fill();
            // BG circle
            ctx.beginPath();
            ctx.arc(pu.x, pu.y, pu.size, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fill();
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // Emoji
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(pu.emoji, pu.x, pu.y);
        }
    }

    // Collisions
    function checkCollisions() {
        // Player bullets vs enemies
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            let b = bullets[bi];
            if (b.type !== 'player') continue;
            for (let ei = enemies.length - 1; ei >= 0; ei--) {
                let e = enemies[ei];
                let dx = b.x - e.x;
                let dy = b.y - e.y;
                if (Math.abs(dx) < e.w / 2 + 4 && Math.abs(dy) < e.h / 2 + 6) {
                    e.hp--;
                    bullets.splice(bi, 1);
                    if (e.hp <= 0) {
                        let pts = e.type === 'boss' ? 100 : (e.type === 'bomber' ? 30 : (e.type === 'stealth' ? 25 : 10));
                        score += pts;
                        kills++;
                        waveResolved = Math.min(waveEnemiesTotal, waveResolved + 1);
                        spawnExplosion(e.x, e.y, e.type === 'boss' ? 30 : 12, COLORS.explosion);
                        playAirforceSound('explosion');
                        // Drop powerup chance
                        if (Math.random() < (e.type === 'boss' ? 1 : 0.15)) {
                            spawnPowerup(e.x, e.y);
                        }
                        enemies.splice(ei, 1);
                    } else {
                        spawnExplosion(b.x, b.y, 3, ['#fff']);
                    }
                    break;
                }
            }
        }

        // Enemy bullets vs player
        if (player.invincible <= 0) {
            for (let bi = bullets.length - 1; bi >= 0; bi--) {
                let b = bullets[bi];
                if (b.type !== 'enemy') continue;
                let dx = b.x - player.x;
                let dy = b.y - player.y;
                const hitRadius = (b.radius || 4) + 8;
                if ((dx * dx) + (dy * dy) < hitRadius * hitRadius) {
                    bullets.splice(bi, 1);
                    if (shieldEnd > Date.now()) {
                        shieldEnd = 0; // shield absorbs hit
                        spawnExplosion(player.x, player.y, 8, ['#06b6d4', '#fff']);
                        playAirforceSound('explosion');
                    } else {
                        playerHit();
                    }
                    break;
                }
            }
        }

        // Enemies vs player (collision)
        if (player.invincible <= 0) {
            for (let ei = enemies.length - 1; ei >= 0; ei--) {
                let e = enemies[ei];
                let dx = e.x - player.x;
                let dy = e.y - player.y;
                if (Math.abs(dx) < (e.w / 2 + 14) && Math.abs(dy) < (e.h / 2 + 18)) {
                    if (shieldEnd > Date.now()) {
                        shieldEnd = 0;
                        spawnExplosion(e.x, e.y, 15, COLORS.explosion);
                        playAirforceSound('explosion');
                        enemies.splice(ei, 1);
                        kills++;
                        score += 5;
                    } else {
                        spawnExplosion(e.x, e.y, 12, COLORS.explosion);
                        playAirforceSound('explosion');
                        enemies.splice(ei, 1);
                        playerHit();
                    }
                    break;
                }
            }
        }
    }

    function playerHit() {
        lives--;
        player.invincible = 90; // ~1.5 sec
        spawnExplosion(player.x, player.y, 15, ['#ef4444', '#fff', '#fbbf24']);
        playAirforceSound('explosion');
        if (lives <= 0) {
            gameOver();
        }
    }

    // Level system
    function startLevel(n) {
        currentLevel = Math.min(n, 10);
        if (n > 10) currentLevel = 10; // Stay at max level
        waveEnemiesLeft = 6 + currentLevel * 3;
        if (currentLevel >= 6) waveEnemiesLeft += 1;
        if (currentLevel === 10) waveEnemiesLeft += 10; // Extra enemies on final level
        waveEnemiesTotal = waveEnemiesLeft;
        waveResolved = 0;
        enemySpawnTimer = 0;
        waveTransition = 120; // 2 sec transition
        initStars();
        updateAirforceThemeUI();
    }

    function updateLevelSystem() {
        if (waveTransition > 0) {
            waveTransition--;
            return;
        }
        if (waveEnemiesLeft > 0 || enemies.length > 0) {
            enemySpawnTimer++;
            let baseSpawnRate = Math.max(32, 108 - currentLevel * 8);
            let spawnRate = baseSpawnRate * LEVEL_SPAWN_MULT[currentLevel];
            if (enemySpawnTimer >= spawnRate && waveEnemiesLeft > 0) {
                enemySpawnTimer = 0;
                spawnEnemy();
                waveEnemiesLeft--;
            }
        } else {
            // Level cleared
            if (currentLevel < 10) {
                startLevel(currentLevel + 1);
            } else {
                startLevel(10); // Stay at the final sector theme and difficulty
            }
        }
    }

    // HUD
    function drawHUD() {
        // Level transition text
        if (waveTransition > 0) {
            ctx.fillStyle = `rgba(6,182,212,${waveTransition / 120})`;
            ctx.font = 'bold 28px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('LEVEL ' + currentLevel, CW / 2, CH / 2 - 10);
            ctx.font = '14px sans-serif';
            ctx.fillStyle = `rgba(255,255,255,${waveTransition / 120})`;
            if (currentLevel === 10) {
                ctx.fillStyle = `rgba(220,38,38,${waveTransition / 120})`;
                ctx.fillText('FINAL MISSION!', CW / 2, CH / 2 + 20);
            } else {
                ctx.fillText('Get Ready!', CW / 2, CH / 2 + 20);
            }
        }

        // Top HUD bar
        const theme = getAirforceTheme(currentLevel);
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fillRect(0, 0, CW, 28);
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = theme.accent;
        ctx.fillText('Score: ' + score, 8, 18);
        ctx.fillStyle = '#ef4444';
        let hearts = '';
        for (let i = 0; i < lives; i++) hearts += '❤️';
        ctx.fillText(hearts, CW / 2 - 30, 19);
        ctx.fillStyle = theme.secondary;
        ctx.textAlign = 'right';
        ctx.fillText('LVL ' + currentLevel, CW - 8, 18);
    }

    // Update sidebar HUD
    function updateSidebarHUD() {
        let scoreEl = document.getElementById('airforceScore');
        let highScoreEl = document.getElementById('airforceHighScore');
        let livesEl = document.getElementById('airforceLives');
        let levelEl = document.getElementById('airforceLevel');
        let rankEl = document.getElementById('airforceRank');
        if (scoreEl) scoreEl.textContent = score;
        if (highScoreEl) highScoreEl.textContent = highScore;
        if (livesEl) livesEl.textContent = lives;
        if (levelEl) levelEl.textContent = currentLevel;
        if (rankEl) rankEl.textContent = getRank(score);
        updateAirforceThemeUI();
    }

    // Game Over
    function gameOver() {
        gameRunning = false;
        playAirforceSound('gameover');
        if (animFrame) cancelAnimationFrame(animFrame);

        // Save high score
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('airforceHighScore', highScore);
        }
        let hsEl = document.getElementById('airforceHighScore');
        if (hsEl) hsEl.textContent = highScore;

        // Show game over overlay
        document.getElementById('airforceGameOverOverlay').classList.remove('hidden');
        const resultTitleEl = document.getElementById('airforceResultTitle');
        const resultSubtitleEl = document.getElementById('airforceResultSubtitle');
        if (resultTitleEl) {
            resultTitleEl.textContent = currentLevel >= 10 ? 'COMMAND FALLEN' : 'MISSION FAILED';
        }
        if (resultSubtitleEl) {
            resultSubtitleEl.textContent = currentLevel >= 10
                ? 'Final sector reached. Relaunch and finish the siege.'
                : 'Regroup, relaunch, and push further into the storm.';
        }
        document.getElementById('airforceFinalScore').textContent = score;
        document.getElementById('airforceFinalLevel').textContent = currentLevel;
        document.getElementById('airforceFinalKills').textContent = kills;

        // Save to Firebase leaderboard
        const pilotName = getStoredAirforcePlayerName() || 'Player';
        if (typeof window.saveLeaderboardScore === 'function') {
            window.saveLeaderboardScore('airforce', pilotName, score);
        }

        updateSidebarHUD();
    }

    // Main game loop
    function gameLoop() {
        if (!gameRunning) return;

        updateStars();
        drawStars();

        updatePlayer();
        drawPlayer();

        // Auto-fire
        autoFireTimer++;
        let fireRate = rapidFireEnd > Date.now() ? 8 : 16;
        if (autoFireTimer >= fireRate) {
            autoFireTimer = 0;
            shoot();
        }

        updateBullets();
        drawBullets();

        updateLevelSystem();
        updateEnemies();
        drawEnemies();

        updatePowerups();
        drawPowerups();

        checkCollisions();

        updateParticles();
        drawParticles();

        drawHUD();

        frameCount++;
        if (frameCount % 15 === 0) updateSidebarHUD();

        animFrame = requestAnimationFrame(gameLoop);
    }

    // Start game
    window.startAirforceGame = function () {
        const airforceNameInput = document.getElementById('airforcePlayerNameInput');
        const airforceNameHint = document.getElementById('airforcePlayerNameHint');
        const enteredName = airforceNameInput ? airforceNameInput.value.trim() : '';
        if (!enteredName) {
            if (airforceNameHint) airforceNameHint.classList.remove('hidden');
            if (airforceNameInput) airforceNameInput.focus();
            return;
        }
        if (airforceNameHint) airforceNameHint.classList.add('hidden');
        setStoredAirforcePlayerName(enteredName);

        canvas = document.getElementById('airforceCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        CW = canvas.width;
        CH = canvas.height;

        // Hide overlays
        document.getElementById('airforceGameOverOverlay').classList.add('hidden');
        document.getElementById('airforceStartScreen').classList.add('hidden');

        score = 0;
        lives = 3;
        currentLevel = 1;
        kills = 0;
        frameCount = 0;
        autoFireTimer = 0;
        rapidFireEnd = 0;
        shieldEnd = 0;
        magnetEnd = 0;

        player = createPlayer();
        bullets = [];
        enemies = [];
        particles = [];
        powerups = [];
        keysDown = {};

        highScore = parseInt(localStorage.getItem('airforceHighScore'), 10) || 0;
        let hsEl = document.getElementById('airforceHighScore');
        if (hsEl) hsEl.textContent = highScore;

        startLevel(1);

        if (animFrame) cancelAnimationFrame(animFrame);
        gameRunning = true;
        gameLoop();
    };

    // Keyboard handlers
    function onKeyDown(e) {
        if (!gameRunning) return;
        let overlay = document.getElementById('airforceGameOverlay');
        if (!overlay || !overlay.classList.contains('active')) return;

        let k = e.key;
        keysDown[k] = true;

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) {
            e.preventDefault();
        }
    }

    function onKeyUp(e) {
        keysDown[e.key] = false;
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const airforceNameInput = document.getElementById('airforcePlayerNameInput');
    const airforceNameHint = document.getElementById('airforcePlayerNameHint');
    if (airforceNameInput) {
        airforceNameInput.value = getStoredAirforcePlayerName();
        airforceNameInput.addEventListener('input', function () {
            if (airforceNameHint && airforceNameInput.value.trim()) {
                airforceNameHint.classList.add('hidden');
            }
        });
        airforceNameInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                window.startAirforceGame();
            }
        });
    }

    // Mouse controls
    document.addEventListener('mousemove', function (e) {
        if (!gameRunning) return;
        let overlay = document.getElementById('airforceGameOverlay');
        if (!overlay || !overlay.classList.contains('active')) return;

        let canvasEl = document.getElementById('airforceCanvas');
        if (!canvasEl) return;
        let rect = canvasEl.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {

            let scaleX = canvasEl.width / rect.width;
            let scaleY = canvasEl.height / rect.height;
            let mx = (e.clientX - rect.left) * scaleX;
            let my = (e.clientY - rect.top) * scaleY;

            player.x = player.x * 0.72 + Math.max(20, Math.min(CW - 20, mx)) * 0.28;
            player.y = player.y * 0.72 + Math.max(30, Math.min(CH - 30, my)) * 0.28;
        }
    });

    // Touch controls for mobile
    let touchStartX = 0, touchStartY = 0;
    document.addEventListener('touchstart', function (e) {
        if (!gameRunning) return;
        let overlay = document.getElementById('airforceGameOverlay');
        if (!overlay || !overlay.classList.contains('active')) return;
        let t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
        if (!gameRunning) return;
        let overlay = document.getElementById('airforceGameOverlay');
        if (!overlay || !overlay.classList.contains('active')) return;
        let t = e.touches[0];
        let dx = t.clientX - touchStartX;
        let dy = t.clientY - touchStartY;
        player.x += dx * 0.35;
        player.y += dy * 0.35;
        player.x = Math.max(20, Math.min(CW - 20, player.x));
        player.y = Math.max(30, Math.min(CH - 30, player.y));
        touchStartX = t.clientX;
        touchStartY = t.clientY;
    }, { passive: true });

    // Cleanup on close
    const origBackToHub = window.backToHub;
    window.backToHub = function (overlayId) {
        if (overlayId === 'airforceGameOverlay') {
            gameRunning = false;
            if (animFrame) cancelAnimationFrame(animFrame);
            keysDown = {};
            bullets = [];
            enemies = [];
            particles = [];
            powerups = [];
            const airforceStartScreen = document.getElementById('airforceStartScreen');
            const airforceGameOverOverlay = document.getElementById('airforceGameOverOverlay');
            const airforceNameHint = document.getElementById('airforcePlayerNameHint');
            if (airforceGameOverOverlay) airforceGameOverOverlay.classList.add('hidden');
            if (airforceStartScreen) airforceStartScreen.classList.remove('hidden');
            if (airforceNameHint) airforceNameHint.classList.add('hidden');
        }
        if (origBackToHub) origBackToHub(overlayId);
    };
})();

// #region 🔒 SONGS HUB - Premium Rotating Music Channels
(function () {
    // ──── Channel Data ────
    const songsChannels = [
        {
            name: 'Bollywood Hits',
            emoji: '🎬',
            genre: 'Hindi Pop',
            bg: 'linear-gradient(135deg, #f97316, #ea580c)',
            streams: [
                'https://stream-14.zeno.fm/r2gn1pgm4qruv',
                'https://server4.ujala.nl/stream/2/listen.mp3',
                'https://bollyvibes.radioca.st/stream'
            ]
        },
        {
            name: 'English Pop Hits',
            emoji: '🌟',
            genre: 'English Pop',
            bg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            streams: [
                'https://kathy.torontocast.com:3060/stream'
            ]
        },
        {
            name: 'Lo-Fi Chill',
            emoji: '🌙',
            genre: 'Lo-Fi Beats',
            bg: 'linear-gradient(135deg, #6366f1, #4338ca)',
            streams: [
                'https://stream.zeno.fm/f3wvbbqmdg8uv'
            ]
        },
        {
            name: 'Retro Classics',
            emoji: '📻',
            genre: 'Old Hindi Gold',
            bg: 'linear-gradient(135deg, #d97706, #b45309)',
            streams: [
                'https://stream.zeno.fm/u0hrd3xkzhhvv',
                'https://airhlspush.pc.cdn.bitgravity.com/httppush/hlspbaudio005/hlspbaudio005_Auto.m3u8',
                'https://air.pc.cdn.bitgravity.com/air/live/pbaudio001/playlist.m3u8'
            ]
        },
        {
            name: 'Romantic Melodies',
            emoji: '💕',
            genre: 'Love Songs (Hindi)',
            bg: 'linear-gradient(135deg, #ec4899, #be185d)',
            streams: [
                'https://drive.uber.radio/uber/bollywoodlove/icecast.audio',
                'https://cp3.shoutcheap.com:18180/stream',
                'https://stream.zeno.fm/cqak4ap7by8uv'
            ]
        },
        {
            name: 'Bolly Top 100',
            emoji: 'ðŸ”¥',
            genre: 'Latest Hindi Hits',
            bg: 'linear-gradient(135deg, #ef4444, #db2777)',
            streams: [
                'https://stream.zeno.fm/1x7m4f2a5ehvv',
                'https://stream.zeno.fm/cqak4ap7by8uv'
            ]
        },
        {
            name: 'Top 40 Global',
            emoji: 'ðŸŒ',
            genre: 'English Top 40',
            bg: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
            streams: [
                'http://strm112.1.fm/top40_mobile_mp3',
                'https://kathy.torontocast.com:3060/stream'
            ]
        },
        {
            name: 'Golden Oldies',
            emoji: 'ðŸ“€',
            genre: 'English Classics',
            bg: 'linear-gradient(135deg, #14b8a6, #0f766e)',
            streams: [
                'http://bigrradio.cdnstream1.com/5198_128',
                'https://kathy.torontocast.com:3060/stream'
            ]
        }
    ];

    let currentAngle = 0;
    let currentPlaying = -1;
    let currentStreamIndex = 0;
    let autoRotateTimer = null;
    let songsAudioEventsBound = false;
    const totalCards = songsChannels.length;
    const songsHubTabId = `songs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const songsHubStateKey = 'cvangSongsHubState';
    const songsHubCommandKey = 'cvangSongsHubCommand';
    let songsVolume = 0.8;
    let previousSongsVolume = 0.8;

    if (!window.__cvangManagedAudio) {
        window.__cvangManagedAudio = {
            isSwitching: false,
            ids: ['songsAudioPlayer', 'calmAudioPlayer', 'fmAudioPlayer', 'myMp3AudioPlayer']
        };
    }

    window.pauseManagedAudioPlayers = window.pauseManagedAudioPlayers || function (exceptIds = []) {
        const manager = window.__cvangManagedAudio;
        if (!manager || manager.isSwitching) return;

        manager.isSwitching = true;

        try {
            manager.ids.forEach(function (id) {
                if (exceptIds.includes(id)) return;
                const media = document.getElementById(id);
                if (!media || media.paused) return;

                if (id === 'songsAudioPlayer' && typeof window.stopSongsChannel === 'function') {
                    window.stopSongsChannel(false);
                    return;
                }

                if (id === 'calmAudioPlayer' && typeof window.stopCalmPlayback === 'function') {
                    window.stopCalmPlayback();
                    return;
                }

                media.pause();
                media.currentTime = 0;
            });
        } finally {
            window.setTimeout(function () {
                manager.isSwitching = false;
            }, 0);
        }
    };

    window.installManagedAudioAutoStop = window.installManagedAudioAutoStop || function () {
        if (document.body?.dataset.managedAudioAutoStopBound === 'true') return;
        if (document.body) {
            document.body.dataset.managedAudioAutoStopBound = 'true';
        }
    };

    window.makeFloatingMiniPlayerDraggable = window.makeFloatingMiniPlayerDraggable || function (playerId, infoSelector, maximizeHandlerName) {
        const miniPlayer = document.getElementById(playerId);
        if (!miniPlayer || miniPlayer.dataset.dragBound === 'true') return;

        miniPlayer.dataset.dragBound = 'true';

        let isDragging = false;
        let pX = 0;
        let pY = 0;
        let startX = 0;
        let startY = 0;
        let isClick = true;

        const miniInfo = miniPlayer.querySelector(infoSelector);
        if (miniInfo) {
            miniInfo.addEventListener('click', function (event) {
                if (!isClick) {
                    event.stopPropagation();
                    return;
                }

                const maximizeHandler = window[maximizeHandlerName];
                if (typeof maximizeHandler === 'function') {
                    maximizeHandler();
                }
            });
            miniInfo.removeAttribute('onclick');
        }

        miniPlayer.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        miniPlayer.addEventListener('touchstart', dragStart, { passive: true });
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', dragEnd);

        function dragStart(event) {
            if (event.target.tagName === 'BUTTON' || event.target.closest('button')) return;

            isDragging = true;
            isClick = true;
            miniPlayer.style.transition = 'none';

            if (event.type === 'touchstart') {
                startX = event.touches[0].clientX;
                startY = event.touches[0].clientY;
            } else {
                startX = event.clientX;
                startY = event.clientY;
            }

            const rect = miniPlayer.getBoundingClientRect();
            pX = startX - rect.left;
            pY = startY - rect.top;
        }

        function drag(event) {
            if (!isDragging) return;

            let clientX;
            let clientY;

            if (event.type === 'touchmove') {
                clientX = event.touches[0].clientX;
                clientY = event.touches[0].clientY;
                event.preventDefault();
            } else {
                clientX = event.clientX;
                clientY = event.clientY;
            }

            if (Math.abs(clientX - startX) > 5 || Math.abs(clientY - startY) > 5) {
                isClick = false;
            }

            if (!isClick) {
                miniPlayer.style.bottom = 'auto';
                miniPlayer.style.right = 'auto';

                let newX = clientX - pX;
                let newY = clientY - pY;
                const maxX = window.innerWidth - miniPlayer.offsetWidth;
                const maxY = window.innerHeight - miniPlayer.offsetHeight;

                newX = Math.max(0, Math.min(newX, maxX));
                newY = Math.max(0, Math.min(newY, maxY));

                miniPlayer.style.left = `${newX}px`;
                miniPlayer.style.top = `${newY}px`;
            }
        }

        function dragEnd() {
            if (!isDragging) return;
            isDragging = false;
            miniPlayer.style.transition = 'all 0.3s ease';
        }
    };

    window.installManagedAudioAutoStop();

    function getSongStreams(channel) {
        if (!channel) return [];
        if (Array.isArray(channel.streams) && channel.streams.length) return channel.streams;
        return channel.stream ? [channel.stream] : [];
    }

    function updateSongsNowPlaying(message) {
        const nowText = document.getElementById('songsNowText');
        if (nowText) nowText.textContent = message;
    }

    function setMiniPlayer(trackText, forceShow = false) {
        const miniPlayer = document.getElementById('songsMiniPlayer');
        const miniText = document.getElementById('miniPlayerText');
        if (miniText && trackText) miniText.textContent = trackText;
        if (miniPlayer && forceShow) miniPlayer.style.display = 'flex';
    }

    function updateVolumeIcons(volumeValue) {
        const volume = Number(volumeValue);
        const icon = volume <= 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊';
        const songsVolumeIcon = document.getElementById('songsVolumeIcon');
        const miniPlayerVolumeIcon = document.getElementById('miniPlayerVolumeIcon');
        if (songsVolumeIcon) songsVolumeIcon.textContent = icon;
        if (miniPlayerVolumeIcon) miniPlayerVolumeIcon.textContent = icon;
    }

    function syncVolumeControls() {
        const slider = document.getElementById('songsVolumeSlider');
        if (slider) slider.value = String(Math.round(songsVolume * 100));
        updateVolumeIcons(songsVolume);
    }

    function ensureMiniPlayerVolumeButton() {
        const miniPlayer = document.getElementById('songsMiniPlayer');
        if (!miniPlayer || document.getElementById('miniPlayerVolumeIcon')) return;

        const stopButton = miniPlayer.querySelector('.mini-player-stop');
        const volumeButton = document.createElement('button');
        volumeButton.className = 'mini-player-volume';
        volumeButton.id = 'miniPlayerVolumeIcon';
        volumeButton.type = 'button';
        volumeButton.textContent = '🔊';
        volumeButton.addEventListener('click', function (event) {
            event.stopPropagation();
            window.toggleSongsMute();
        });

        if (stopButton) {
            miniPlayer.insertBefore(volumeButton, stopButton);
        } else {
            miniPlayer.appendChild(volumeButton);
        }
    }

    function applySongsVolume() {
        const audio = document.getElementById('songsAudioPlayer');
        if (audio) audio.volume = songsVolume;
        syncVolumeControls();
    }

    function broadcastSongsHubState(payload) {
        try {
            localStorage.setItem(
                songsHubStateKey,
                JSON.stringify({
                    ...payload,
                    updatedAt: Date.now()
                })
            );
        } catch (error) {
            console.warn('Songs Hub state sync failed:', error);
        }
    }

    function syncSongsHubState() {
        const overlay = document.getElementById('songsHubOverlay');
        const isMinimized = !!(overlay && !overlay.classList.contains('active') && currentPlaying !== -1);
        const channel = currentPlaying !== -1 ? songsChannels[currentPlaying] : null;

        broadcastSongsHubState({
            ownerId: songsHubTabId,
            playing: currentPlaying !== -1,
            minimized: isMinimized,
            channelIndex: currentPlaying,
            text: channel ? `${channel.name} Playing...` : '',
            label: channel ? `${channel.emoji} ${channel.name} - ${channel.genre}` : 'Select a channel to play'
        });
    }

    function showSyncedMiniPlayer(text) {
        const overlay = document.getElementById('songsHubOverlay');
        if (overlay && overlay.classList.contains('active')) return;
        setMiniPlayer(text || 'Song Playing...', true);
    }

    function hideMiniPlayerIfIdle() {
        const miniPlayer = document.getElementById('songsMiniPlayer');
        if (miniPlayer && currentPlaying === -1) miniPlayer.style.display = 'none';
    }

    function sendSongsHubCommand(type) {
        try {
            localStorage.setItem(
                songsHubCommandKey,
                JSON.stringify({
                    type,
                    sourceId: songsHubTabId,
                    updatedAt: Date.now()
                })
            );
        } catch (error) {
            console.warn('Songs Hub command sync failed:', error);
        }
    }

    function bindSongsAudioEvents() {
        if (songsAudioEventsBound) return;

        const audio = document.getElementById('songsAudioPlayer');
        if (!audio) return;

        audio.volume = songsVolume;
        audio.addEventListener('error', tryNextSongsStream);
        audio.addEventListener('stalled', tryNextSongsStream);
        songsAudioEventsBound = true;
    }

    function tryNextSongsStream() {
        if (currentPlaying === -1) return;

        const audio = document.getElementById('songsAudioPlayer');
        const channel = songsChannels[currentPlaying];
        const streams = getSongStreams(channel);
        if (!audio || !channel || streams.length === 0) return;

        if (currentStreamIndex < streams.length - 1) {
            currentStreamIndex += 1;
            updateSongsNowPlaying(`${channel.emoji} ${channel.name} - trying backup stream...`);
            setMiniPlayer(`${channel.name} - trying backup...`);
            audio.src = streams[currentStreamIndex];
            audio.load();
            audio.play().catch(err => console.warn('Backup audio play failed:', err));
            return;
        }

        updateSongsNowPlaying(`${channel.emoji} ${channel.name} is unavailable right now`);
        setMiniPlayer(`${channel.name} unavailable`, true);
        console.warn(`All streams failed for ${channel.name}`);
    }

    // ──── Build Carousel ────
    function buildSongsCarousel() {
        const carousel = document.getElementById('songsCarousel');
        if (!carousel) return;
        bindSongsAudioEvents();
        carousel.innerHTML = '';

        songsChannels.forEach((ch, i) => {
            const card = document.createElement('div');
            card.className = 'songs-channel-card';
            card.style.background = ch.bg;
            card.innerHTML = `
                <span class="card-emoji">${ch.emoji}</span>
                <span class="card-name">${ch.name}</span>
                <span class="card-genre">${ch.genre}</span>
            `;
            card.addEventListener('click', () => playSongsChannel(i));
            carousel.appendChild(card);
        });

        positionCards();
    }

    function positionCards() {
        const carousel = document.getElementById('songsCarousel');
        if (!carousel) return;
        const cards = carousel.querySelectorAll('.songs-channel-card');

        cards.forEach((card, i) => {
            card.style.transform = 'none';
            card.style.opacity = '1';
            card.style.zIndex = String(10 + i);
            card.style.pointerEvents = 'auto';
        });
    }

    // ──── Rotate ────
    window.rotateSongsCarousel = function () {
        positionCards();
    };

    function autoRotate() {
        positionCards();
    }

    window.setSongsVolume = function (value) {
        const parsedVolume = Math.min(100, Math.max(0, Number(value))) / 100;
        songsVolume = parsedVolume;
        if (songsVolume > 0) previousSongsVolume = songsVolume;
        applySongsVolume();
    };

    window.toggleSongsMute = function () {
        if (songsVolume <= 0) {
            songsVolume = previousSongsVolume > 0 ? previousSongsVolume : 0.8;
        } else {
            previousSongsVolume = songsVolume;
            songsVolume = 0;
        }
        applySongsVolume();
    };

    function startAutoRotate() {
        stopAutoRotate();
        autoRotateTimer = setInterval(autoRotate, 4000);
    }

    function stopAutoRotate() {
        if (autoRotateTimer) {
            clearInterval(autoRotateTimer);
            autoRotateTimer = null;
        }
    }

    function restartAutoRotate() {
        stopAutoRotate();
        autoRotateTimer = setInterval(autoRotate, 4000);
    }

    // ──── Play Channel ────
    function playSongsChannel(index) {
        const audio = document.getElementById('songsAudioPlayer');
        const eq = document.getElementById('songsEQ');
        const nowText = document.getElementById('songsNowText');
        const stopBtn = document.getElementById('songsStopBtn');
        const carousel = document.getElementById('songsCarousel');

        if (!audio || !eq || !nowText || !stopBtn || !carousel) return;

        // Stop current
        audio.pause();
        audio.src = '';

        // Remove all playing states
        carousel.querySelectorAll('.songs-channel-card').forEach(c => c.classList.remove('playing'));

        if (currentPlaying === index) {
            // Toggle off
            window.stopSongsChannel();
            return;
        }

        // Play new
        currentPlaying = index;
        currentStreamIndex = 0;
        const ch = songsChannels[index];
        const streams = getSongStreams(ch);
        if (!streams.length) {
            updateSongsNowPlaying(`${ch.emoji} ${ch.name} has no stream configured`);
            return;
        }

        window.pauseManagedAudioPlayers(['songsAudioPlayer']);
        audio.src = streams[currentStreamIndex];
        audio.load();
        audio.play().catch(err => console.warn('Audio play failed:', err));

        // Update UI
        const cards = carousel.querySelectorAll('.songs-channel-card');
        if (cards[index]) cards[index].classList.add('playing');
        eq.classList.add('active');
        nowText.textContent = `${ch.emoji} ${ch.name} — ${ch.genre}`;
        stopBtn.style.display = 'inline-block';

        setMiniPlayer(`${ch.name} Playing...`);
        syncSongsHubState();
    }

    // ──── Stop ────
    window.stopSongsChannel = function (shouldBroadcast = true) {
        const audio = document.getElementById('songsAudioPlayer');
        const eq = document.getElementById('songsEQ');
        const nowText = document.getElementById('songsNowText');
        const stopBtn = document.getElementById('songsStopBtn');
        const carousel = document.getElementById('songsCarousel');
        const miniPlayer = document.getElementById('songsMiniPlayer');

        if (audio) { audio.pause(); audio.src = ''; }
        if (eq) eq.classList.remove('active');
        if (nowText) nowText.textContent = 'Select a channel to play';
        if (stopBtn) stopBtn.style.display = 'none';
        if (carousel) carousel.querySelectorAll('.songs-channel-card').forEach(c => c.classList.remove('playing'));
        if (miniPlayer) miniPlayer.style.display = 'none';
        currentPlaying = -1;
        currentStreamIndex = 0;

        broadcastSongsHubState({
            ownerId: songsHubTabId,
            playing: false,
            minimized: false,
            channelIndex: -1,
            text: '',
            label: 'Select a channel to play'
        });

        if (shouldBroadcast) {
            sendSongsHubCommand('stop');
        }
    };

    // ──── Minimize & Maximize ────
    window.minimizeSongsHub = function () {
        if (currentPlaying === -1) {
            alert("Play a song first before minimizing!");
            return;
        }
        const overlay = document.getElementById('songsHubOverlay');
        const miniPlayer = document.getElementById('songsMiniPlayer');
        if (overlay) overlay.classList.remove('active');
        if (miniPlayer) miniPlayer.style.display = 'flex';
        syncSongsHubState();
        stopAutoRotate();
    };

    window.maximizeSongsHub = function () {
        const overlay = document.getElementById('songsHubOverlay');
        const miniPlayer = document.getElementById('songsMiniPlayer');
        if (overlay) overlay.classList.add('active');
        if (miniPlayer) miniPlayer.style.display = 'none';
        syncSongsHubState();
        startAutoRotate();
    };

    // ──── Open / Close with Password ────
    window.openSongsHub = function () {
        var password = prompt('🔒 Enter Password to open Songs Hub:');
        if (password !== 'wow') {
            if (password !== null) alert('❌ Wrong Password!');
            return;
        }

        const overlay = document.getElementById('songsHubOverlay');
        const miniPlayer = document.getElementById('songsMiniPlayer');
        if (miniPlayer && miniPlayer.style.display === 'flex') {
            window.maximizeSongsHub();
            return;
        }

        if (!overlay) return;
        overlay.classList.add('active');
        buildSongsCarousel();
        startAutoRotate();
    };

    window.closeSongsHub = function () {
        const overlay = document.getElementById('songsHubOverlay');
        if (overlay) overlay.classList.remove('active');
        stopAutoRotate();
        window.stopSongsChannel();
    };

    // Close on outside click
    document.addEventListener('click', function (e) {
        const overlay = document.getElementById('songsHubOverlay');
        if (e.target === overlay) {
            window.closeSongsHub();
        }
    });

    // ──── Draggable Mini Player Logic ────
    window.addEventListener('storage', function (event) {
        if (event.key === songsHubStateKey && event.newValue) {
            try {
                const state = JSON.parse(event.newValue);
                if (!state || state.ownerId === songsHubTabId) return;

                updateSongsNowPlaying(state.label || 'Song Playing in another tab');
                setMiniPlayer(state.text || 'Song Playing...');

                if (state.playing && state.minimized) {
                    showSyncedMiniPlayer(state.text || 'Song Playing...');
                } else if (!state.playing) {
                    hideMiniPlayerIfIdle();
                }
            } catch (error) {
                console.warn('Songs Hub state parse failed:', error);
            }
        }

        if (event.key === songsHubCommandKey && event.newValue) {
            try {
                const command = JSON.parse(event.newValue);
                if (!command || command.sourceId === songsHubTabId) return;

                if (command.type === 'stop' && currentPlaying !== -1) {
                    window.stopSongsChannel(false);
                }
            } catch (error) {
                console.warn('Songs Hub command parse failed:', error);
            }
        }
    });

    try {
        const initialSongsState = localStorage.getItem(songsHubStateKey);
        if (initialSongsState) {
            const state = JSON.parse(initialSongsState);
            if (state && state.playing && state.ownerId !== songsHubTabId) {
                updateSongsNowPlaying(state.label || 'Song Playing in another tab');
                showSyncedMiniPlayer(state.text || 'Song Playing...');
            }
        }
    } catch (error) {
        console.warn('Songs Hub initial sync failed:', error);
    }

    ensureMiniPlayerVolumeButton();
    applySongsVolume();
    window.makeFloatingMiniPlayerDraggable('songsMiniPlayer', '.mini-player-info', 'maximizeSongsHub');
})();
// #endregion

(function () {
    const CHESS_ROOM_PREFIX = 'chessRooms';
    const CHESS_SESSION_KEY = 'chessSessionId';
    const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const PIECES = {
        p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚',
        P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔'
    };
    const chessState = {
        mode: 'host',
        sessionId: localStorage.getItem(CHESS_SESSION_KEY) || `chess_${Math.random().toString(36).slice(2, 10)}`,
        unsubscribe: null,
        roomCode: '',
        role: '',
        roomData: null,
        selectedSquare: null,
        legalTargets: [],
        audioCtx: null,
        approvalPromptKey: '',
        approvalPromptOpen: false,
        approvalQueueIndex: 0,
        notificationKey: '',
        resultModalKey: '',
        warningKey: '',
        warningModalKey: '',
        warningModalTimer: 0,
        chatToastKey: '',
        chatToastTimer: 0,
        sidebarLayoutMode: ''
    };
    localStorage.setItem(CHESS_SESSION_KEY, chessState.sessionId);

    function getChessPlayerName() {
        return (localStorage.getItem(CHESS_PLAYER_NAME_KEY) || '').trim();
    }

    function setChessPlayerName(name) {
        localStorage.setItem(CHESS_PLAYER_NAME_KEY, name.trim());
    }

    function getChessInstance(fen) {
        if (typeof Chess === 'undefined') return null;
        return fen ? new Chess(fen) : new Chess();
    }

    function chessIsGameOver(game) {
        return typeof game.isGameOver === 'function' ? game.isGameOver() : game.game_over();
    }

    function chessIsCheckmate(game) {
        return typeof game.isCheckmate === 'function' ? game.isCheckmate() : game.in_checkmate();
    }

    function chessIsDraw(game) {
        return typeof game.isDraw === 'function' ? game.isDraw() : game.in_draw();
    }

    function chessInCheck(game) {
        return typeof game.inCheck === 'function' ? game.inCheck() : game.in_check();
    }

    function getChessRoomRef(code) {
        return dbRef(db, `${CHESS_ROOM_PREFIX}/${code}`);
    }

    function getChessMessagesRef(code) {
        return dbRef(db, `${CHESS_ROOM_PREFIX}/${code}/messages`);
    }

    function escapeChessHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatChessChatTime(timestamp) {
        if (!timestamp) return '';
        try {
            return new Date(timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return '';
        }
    }

    function getChessMessages(room) {
        if (!room?.messages) return [];
        return Object.values(room.messages)
            .filter(Boolean)
            .sort((left, right) => (left?.createdAt || 0) - (right?.createdAt || 0));
    }

    function isOwnChessMessage(message) {
        return message?.sessionId === chessState.sessionId;
    }

    function canLocalChatInChess(room) {
        return !!room
            && room.status === 'active'
            && (chessState.role === 'host' || chessState.role === 'guest');
    }

    function hideChessChatToast(resetKey = false) {
        const toast = document.getElementById('chessChatToast');
        if (toast) {
            toast.innerHTML = '';
            toast.classList.add('hidden');
        }
        if (chessState.chatToastTimer) {
            clearTimeout(chessState.chatToastTimer);
            chessState.chatToastTimer = 0;
        }
        if (resetKey !== false) {
            chessState.chatToastKey = '';
        }
    }

    function renderChessChatToast(room) {
        const toast = document.getElementById('chessChatToast');
        if (!toast || !room) {
            hideChessChatToast(true);
            return;
        }

        const messages = getChessMessages(room);
        const latestMessage = messages[messages.length - 1];
        if (!latestMessage) {
            hideChessChatToast(true);
            return;
        }

        const toastKey = `${latestMessage?.createdAt || 0}:${latestMessage?.sessionId || ''}:${latestMessage?.text || ''}`;
        if (!toastKey || toastKey === chessState.chatToastKey) {
            return;
        }

        chessState.chatToastKey = toastKey;
        toast.innerHTML = `
            <div class="chess-chat-toast-head">
                <span class="chess-chat-toast-name">${escapeChessHtml(latestMessage?.name || 'Player')}</span>
                <span class="chess-chat-toast-time">${escapeChessHtml(formatChessChatTime(latestMessage?.createdAt))}</span>
            </div>
            <div class="chess-chat-toast-text">${escapeChessHtml(latestMessage?.text || '')}</div>
        `;
        toast.classList.remove('hidden');

        if (chessState.chatToastTimer) {
            clearTimeout(chessState.chatToastTimer);
        }
        chessState.chatToastTimer = window.setTimeout(() => {
            const liveToast = document.getElementById('chessChatToast');
            if (!liveToast || chessState.chatToastKey !== toastKey) return;
            liveToast.innerHTML = '';
            liveToast.classList.add('hidden');
            chessState.chatToastTimer = 0;
        }, 5000);
    }

    async function maybeNotifyChessApproval(room, pendingRequest, requestKey) {
        if (!pendingRequest || !requestKey || chessState.notificationKey === requestKey) return;
        chessState.notificationKey = requestKey;
        if (typeof Notification === 'undefined') return;
        try {
            let permission = Notification.permission;
            if (permission === 'default') {
                permission = await Notification.requestPermission();
            }
            if (permission === 'granted') {
                const requestName = pendingRequest.name || 'A player';
                new Notification('Chess join request', {
                    body: `${requestName} requested approval to join room ${room.code || chessState.roomCode}.`
                });
            }
        } catch (error) { }
    }

    function renderChessChat(room) {
        const list = document.getElementById('chessChatList');
        const input = document.getElementById('chessChatInput');
        const sendBtn = document.getElementById('chessChatSendBtn');
        if (!list || !input || !sendBtn) return;

        if (!room) {
            list.innerHTML = '<li class="chess-chat-empty">Create or join a room to unlock chess chat.</li>';
            input.value = '';
            input.disabled = true;
            sendBtn.disabled = true;
            hideChessChatToast(true);
            return;
        }

        const canChat = canLocalChatInChess(room);
        input.disabled = !canChat;
        sendBtn.disabled = !canChat;
        input.placeholder = canChat ? 'Type a room message' : 'Chat unlocks after the match starts';

        const messages = getChessMessages(room);
        if (!messages.length) {
            list.innerHTML = `<li class="chess-chat-empty">${room.status === 'active' ? 'No room messages yet. Send the first one.' : 'Players can chat here once the match starts.'}</li>`;
            hideChessChatToast(true);
            return;
        }

        list.innerHTML = messages.slice(-18).map(message => {
            const ownClass = isOwnChessMessage(message) ? 'own' : 'other';
            return `
                <li class="chess-chat-row ${ownClass}">
                    <div class="chess-chat-bubble">
                        <div class="chess-chat-bubble-head">
                            <div class="chess-chat-meta">${escapeChessHtml(message?.name || 'Player')}</div>
                            <div class="chess-chat-time">${escapeChessHtml(formatChessChatTime(message?.createdAt))}</div>
                        </div>
                        <div class="chess-chat-text">${escapeChessHtml(message?.text || '')}</div>
                    </div>
                </li>
            `;
        }).join('');
        list.scrollTop = list.scrollHeight;
        renderChessChatToast(room);
    }

    function closeChessWarningModal(resetKey = false) {
        const modal = document.getElementById('chessWarningModal');
        if (modal) modal.classList.add('hidden');
        if (chessState.warningModalTimer) {
            clearTimeout(chessState.warningModalTimer);
            chessState.warningModalTimer = 0;
        }
        if (resetKey) chessState.warningModalKey = '';
    }

    function updateChessWarningModal(room) {
        const modal = document.getElementById('chessWarningModal');
        const badge = document.getElementById('chessWarningModalBadge');
        const title = document.getElementById('chessWarningModalTitle');
        const text = document.getElementById('chessWarningModalText');
        if (!modal || !badge || !title || !text) return;

        const warningType = room?.warningType || '';
        const warningText = room?.warningText || '';
        const isPriorityWarning = warningType === 'check' || warningType === 'checkmate';
        if (!isPriorityWarning || !warningText) {
            closeChessWarningModal();
            if (!warningType) chessState.warningModalKey = '';
            return;
        }

        const warningModalKey = `${room?.updatedAt || room?.lastMove?.createdAt || 0}:${warningType}:${warningText}`;
        if (warningModalKey === chessState.warningModalKey) return;

        chessState.warningModalKey = warningModalKey;
        modal.classList.remove('hidden');
        badge.textContent = warningType === 'checkmate' ? 'Checkmate' : 'Check';
        title.textContent = warningType === 'checkmate' ? 'Checkmate on the Board' : 'Check on the King';
        text.textContent = warningText;

        if (chessState.warningModalTimer) {
            clearTimeout(chessState.warningModalTimer);
            chessState.warningModalTimer = 0;
        }

        if (warningType === 'check') {
            chessState.warningModalTimer = window.setTimeout(() => {
                closeChessWarningModal();
            }, 4200);
        }
    }

    function updateChessWarningBanner(room) {
        const banner = document.getElementById('chessWarningBanner');
        if (!banner) return;
        const warningText = room?.warningText || '';
        const warningType = room?.warningType || '';
        const showWarning = !!warningText && warningType !== 'check' && warningType !== 'checkmate';
        banner.classList.toggle('hidden', !showWarning);
        banner.textContent = warningText;
        const warningKey = warningText ? `${warningType || 'warning'}:${warningText}` : '';
        if (warningText && chessState.warningKey !== warningKey) {
            playChessTone('alert');
        }
        chessState.warningKey = warningKey;
        updateChessWarningModal(room);
    }

    function closeChessResultModal() {
        document.getElementById('chessResultModal')?.classList.add('hidden');
    }

    function updateChessResultModal(room) {
        const modal = document.getElementById('chessResultModal');
        const badge = document.getElementById('chessResultBadge');
        const title = document.getElementById('chessResultTitle');
        const text = document.getElementById('chessResultText');
        const restartBtn = document.getElementById('chessResultRestartBtn');
        if (!modal || !badge || !title || !text || !restartBtn) return;

        if (!room || room.status !== 'finished') {
            chessState.resultModalKey = '';
            modal.classList.add('hidden');
            return;
        }

        const resultKey = `${room.updatedAt || 0}:${room.resultText || ''}:${room.winnerName || ''}`;
        if (resultKey !== chessState.resultModalKey) {
            modal.classList.remove('hidden');
            chessState.resultModalKey = resultKey;
        }

        const localColor = chessState.role === 'host' ? 'w' : chessState.role === 'guest' ? 'b' : '';
        const isDraw = room.finishReason === 'draw' || !room.winnerColor;
        const isWinner = !isDraw && !!localColor && room.winnerColor === localColor;
        const hasSeat = !!localColor;
        badge.textContent = isDraw ? 'Match Drawn' : (isWinner ? 'Victory' : 'Defeat');
        title.textContent = isDraw ? 'Draw Game' : (!hasSeat ? `${room.winnerName || 'Player'} Won` : (isWinner ? 'You Won' : 'You Lost'));
        text.textContent = isDraw
            ? (room.resultText || 'The match ended in a draw.')
            : isWinner
                ? `${room.winnerName || 'Player'} wins the game. ${room.loserName ? `${room.loserName} loses this round.` : ''}`.trim()
                : `${room.winnerName || 'Player'} wins the game. ${room.loserName ? `${room.loserName} loses this round.` : ''}`.trim();
        restartBtn.disabled = chessState.role !== 'host';
    }

    function playChessTone(type) {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            if (!chessState.audioCtx) chessState.audioCtx = new AudioCtx();
            const ctx = chessState.audioCtx;
            if (ctx.state === 'suspended') ctx.resume();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const tones = {
                move: { f: 320, g: 0.03, d: 0.08 },
                capture: { f: 220, g: 0.05, d: 0.12 },
                alert: { f: 520, g: 0.04, d: 0.1 },
                win: { f: 680, g: 0.05, d: 0.18 }
            };
            const tone = tones[type] || tones.move;
            osc.type = type === 'capture' ? 'square' : 'triangle';
            osc.frequency.value = tone.f;
            gain.gain.value = tone.g;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + tone.d);
        } catch (error) { }
    }

    function setChessNotice(text) {
        const el = document.getElementById('chessStatusBanner');
        if (el) el.textContent = text;
    }

    function setChessMode(mode) {
        chessState.mode = mode;
        document.getElementById('chessHostPanel')?.classList.toggle('hidden', mode !== 'host');
        document.getElementById('chessJoinPanel')?.classList.toggle('hidden', mode !== 'join');
        document.getElementById('chessHostTab')?.classList.toggle('active', mode === 'host');
        document.getElementById('chessJoinTab')?.classList.toggle('active', mode === 'join');
    }

    function toggleChessPanels(hasRoom) {
        document.getElementById('chessIntroPanel')?.classList.remove('hidden');
        document.getElementById('chessBoardStage')?.classList.remove('hidden');
    }

    function cleanupChessSubscription() {
        if (typeof chessState.unsubscribe === 'function') chessState.unsubscribe();
        chessState.unsubscribe = null;
    }

    function getChessOrientation() {
        return chessState.role === 'guest' ? 'black' : 'white';
    }

    function inferChessRole(room) {
        if (!room) return '';
        if (room.host?.sessionId === chessState.sessionId) return 'host';
        if (room.guest?.sessionId === chessState.sessionId) return 'guest';
        if (room.guestRequest?.sessionId === chessState.sessionId) return 'guestPending';
        return '';
    }

    function isChessPaused(room) {
        return !!room?.paused;
    }

    function canControlChessPause() {
        return chessState.role === 'host' || chessState.role === 'guest';
    }

    function getChessGuestRequestKey(request) {
        if (!request?.sessionId) return '';
        return `${request.sessionId}:${request.requestedAt || 0}`;
    }

    function maybePromptChessApproval(room) {
        const pendingRequest = room?.guestRequest && room.guestRequest.status === 'pending' ? room.guestRequest : null;
        if (chessState.role !== 'host' || !pendingRequest) {
            if (!pendingRequest) {
                chessState.approvalPromptKey = '';
                chessState.notificationKey = '';
            }
            return;
        }

        const requestKey = getChessGuestRequestKey(pendingRequest);
        if (!requestKey || chessState.approvalPromptKey === requestKey) return;
        chessState.approvalPromptKey = requestKey;
        playChessTone('alert');
        maybeNotifyChessApproval(room, pendingRequest, requestKey);
    }

    function updateChessMoveFeed(room) {
        const list = document.getElementById('chessMoveList');
        if (!list) return;
        const moves = Array.isArray(room?.moveLog) ? room.moveLog.slice(-8) : [];
        list.innerHTML = '';
        if (!moves.length) {
            list.innerHTML = `<li>${room?.status === 'waiting' ? 'Room is waiting for both players.' : 'No moves yet.'}</li>`;
            return;
        }
        moves.forEach((move, index) => {
            const li = document.createElement('li');
            if (index === moves.length - 1) li.classList.add('latest');
            li.textContent = `${move.moveNo || index + 1}. ${move.san} • ${move.byName || 'Player'}`;
            list.appendChild(li);
        });
    }

    function updateChessSidebar(room) {
        const status = room?.status || 'idle';
        const paused = isChessPaused(room);
        const pauseTarget = status === 'active' ? 'match' : 'room';
        const pendingRequest = room?.guestRequest && room.guestRequest.status === 'pending' ? room.guestRequest : null;
        const approvalPopup = document.getElementById('chessApprovalPopup');
        const approvalPopupText = document.getElementById('chessApprovalPopupText');
        const lastMoveIndicator = document.getElementById('chessLastMoveIndicator');
        const boardMoveBanner = document.getElementById('chessBoardMoveBanner');
        const roomModeChip = document.getElementById('chessRoomModeChip');
        const turnChip = document.getElementById('chessTurnChip');
        const baseRoleHint = chessState.role === 'host'
            ? 'You are hosting as White.'
            : chessState.role === 'guest'
                ? 'You joined as Black.'
                : chessState.role === 'guestPending'
                    ? 'Join request sent. Waiting for host approval.'
                    : 'Choose Host Room or Find Room to begin.';
        document.getElementById('chessRoomCodeDisplay').textContent = room?.code || chessState.roomCode || '------';
        document.getElementById('chessHostPlayerName').textContent = room?.host?.name || 'Waiting for host';
        document.getElementById('chessGuestPlayerName').textContent = room?.guest?.name || 'No opponent yet';
        if (roomModeChip) {
            roomModeChip.textContent = status === 'finished'
                ? 'Match Complete'
                : paused
                    ? (status === 'active' ? 'Match Paused' : 'Room Paused')
                    : status === 'active'
                        ? 'Room Active'
                        : 'Lobby Ready';
        }
        if (turnChip) {
            turnChip.textContent = status === 'active'
                ? (paused ? 'Paused' : (room.currentTurn === 'b' ? 'Black to Move' : 'White to Move'))
                : paused
                    ? 'Paused'
                    : 'Waiting';
        }
        document.getElementById('chessMatchHeadline').textContent = status === 'finished'
            ? (room?.resultText || 'Match finished')
            : paused
                ? (status === 'active' ? 'Match paused' : 'Room paused')
                : status === 'active'
                    ? 'Match live'
                    : chessState.role === 'host'
                        ? 'Room live. Share the code.'
                        : chessState.role === 'guestPending'
                            ? 'Approval pending'
                            : 'No live room';
        document.getElementById('chessRoleHint').textContent = paused
            ? `${baseRoleHint} ${room?.pausedBy ? `${room.pausedBy} paused the ${pauseTarget}.` : `This ${pauseTarget} is paused.`}`
            : baseRoleHint;
        if (lastMoveIndicator) {
            const lastMove = room?.lastMove || null;
            const showLastMove = !!lastMove?.san;
            lastMoveIndicator.classList.toggle('hidden', !showLastMove);
            if (showLastMove) {
                lastMoveIndicator.textContent = `Last move: ${lastMove.san} by ${lastMove.byName || 'Player'} (${lastMove.from} to ${lastMove.to})`;
            } else {
                lastMoveIndicator.textContent = 'Last move will appear here.';
            }
        }
        if (boardMoveBanner) {
            const lastMove = room?.lastMove || null;
            const showLastMove = !!lastMove?.san;
            boardMoveBanner.classList.toggle('hidden', !showLastMove);
            if (showLastMove) {
                boardMoveBanner.textContent = `Latest move on board: ${lastMove.san} by ${lastMove.byName || 'Player'} from ${lastMove.from} to ${lastMove.to}`;
            } else {
                boardMoveBanner.textContent = 'Last move will appear here.';
            }
        }
        document.getElementById('chessApprovalCard')?.classList.toggle('hidden', !(chessState.role === 'host' && pendingRequest));
        document.getElementById('chessWaitingCard')?.classList.toggle('hidden', chessState.role !== 'guestPending');
        if (pendingRequest) {
            document.getElementById('chessApprovalText').textContent = `${pendingRequest.name} requested approval to join this room. Approve to start the match.`;
            if (approvalPopupText) {
                approvalPopupText.textContent = `${pendingRequest.name} requested approval to join room ${room?.code || chessState.roomCode}. This popup will stay here until you approve or decline the request.`;
            }
        }
        approvalPopup?.classList.toggle('hidden', !(chessState.role === 'host' && pendingRequest));
        if (chessState.role === 'guestPending') {
            document.getElementById('chessWaitingText').textContent = room?.guestRequest?.status === 'declined'
                ? 'Host declined the request. Ask for a new approval or retry.'
                : 'Waiting for host approval. Stay on this screen until the host accepts.';
        }
        updateChessActionState(room);
    }

    function updateChessActionState(room) {
        const copyBtn = document.getElementById('chessCopyCodeBtn');
        const shareBtn = document.getElementById('chessShareCodeBtn');
        const sidebarShareBtn = document.getElementById('chessSidebarShareCodeBtn');
        const restartBtn = document.getElementById('chessRestartBtn');
        const pauseBtn = document.getElementById('chessPauseBtn');
        if (copyBtn) copyBtn.disabled = !room?.code;
        if (shareBtn) shareBtn.disabled = !room?.code || chessState.role !== 'host';
        if (sidebarShareBtn) sidebarShareBtn.disabled = !room?.code || chessState.role !== 'host';
        if (restartBtn) restartBtn.disabled = !room || chessState.role !== 'host';
        if (!pauseBtn) return;

        if (!room) {
            pauseBtn.disabled = true;
            pauseBtn.textContent = 'Pause Match';
            return;
        }

        pauseBtn.disabled = !canControlChessPause() || room.status === 'finished';
        pauseBtn.textContent = isChessPaused(room)
            ? (room.status === 'active' ? 'Resume Match' : 'Resume Room')
            : (room.status === 'active' ? 'Pause Match' : 'Pause Room');
    }

    function setSidebarCardOrder(element, order) {
        if (!element) return;
        element.style.order = String(order);
    }

    function updateChessSidebarLayout(room) {
        const sidebar = document.querySelector('#chessGameOverlay .chess-sidebar');
        const introPanel = document.getElementById('chessIntroPanel');
        const chatCard = document.getElementById('chessChatCard');
        const approvalCard = document.getElementById('chessApprovalCard');
        const waitingCard = document.getElementById('chessWaitingCard');
        const matchStatusCard = document.getElementById('chessMatchStatusCard');
        const moveFeedCard = document.getElementById('chessMoveFeedCard');
        const roomControlCard = document.getElementById('chessRoomControlCard');
        const actionCard = document.getElementById('chessActionCard');
        const liveMatch = room?.status === 'active' || room?.status === 'finished';
        const layoutMode = room ? (liveMatch ? 'live' : 'lobby') : 'idle';

        if (chatCard) {
            chatCard.classList.toggle('hidden', !liveMatch);
            chatCard.classList.toggle('live', liveMatch);
        }

        if (introPanel) {
            introPanel.classList.remove('hidden');
            introPanel.classList.toggle('live', !!room);
            setSidebarCardOrder(introPanel, -7);
        }

        if (liveMatch) {
            setSidebarCardOrder(chatCard, -6);
            setSidebarCardOrder(matchStatusCard, -5);
            setSidebarCardOrder(roomControlCard, -4);
            setSidebarCardOrder(moveFeedCard, -3);
            setSidebarCardOrder(actionCard, -2);
            setSidebarCardOrder(approvalCard, -1);
            setSidebarCardOrder(waitingCard, -1);
        } else {
            setSidebarCardOrder(roomControlCard, -6);
            setSidebarCardOrder(approvalCard, -5);
            setSidebarCardOrder(waitingCard, -5);
            setSidebarCardOrder(matchStatusCard, -4);
            setSidebarCardOrder(actionCard, -3);
            setSidebarCardOrder(moveFeedCard, 0);
            setSidebarCardOrder(chatCard, 6);
        }

        if (sidebar && chessState.sidebarLayoutMode !== layoutMode) {
            sidebar.scrollTop = 0;
        }
        chessState.sidebarLayoutMode = layoutMode;
    }

    function renderChessBoard(room) {
        const boardEl = document.getElementById('chessBoard');
        if (!boardEl) return;
        const game = getChessInstance(room?.fen);
        if (!game) {
            setChessNotice('Chess engine failed to load. Refresh once and try again.');
            return;
        }
        const orientation = getChessOrientation();
        const files = orientation === 'white' ? FILES : [...FILES].reverse();
        const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
        const canPlay = room?.status === 'active'
            && !isChessPaused(room)
            && ((chessState.role === 'host' && room.currentTurn === 'w') || (chessState.role === 'guest' && room.currentTurn === 'b'));
        const lastMove = room?.lastMove || null;
        boardEl.innerHTML = '';
        ranks.forEach((rank, rowIndex) => {
            files.forEach((file, colIndex) => {
                const square = `${file}${rank}`;
                const piece = game.get(square);
                const isSelected = chessState.selectedSquare === square;
                const legalTarget = chessState.legalTargets.find(move => move.to === square);
                const squareBtn = document.createElement('button');
                squareBtn.type = 'button';
                squareBtn.className = `chess-square ${(rowIndex + colIndex) % 2 === 0 ? 'light' : 'dark'}${isSelected ? ' selected' : ''}${legalTarget ? ` ${piece ? 'capture' : 'legal'}` : ''}${lastMove?.from === square ? ' last-from' : ''}${lastMove?.to === square ? ' last-to' : ''}${!canPlay ? ' disabled' : ''}`;
                squareBtn.onclick = () => handleChessSquareClick(square);
                if (piece) {
                    const pieceEl = document.createElement('span');
                    pieceEl.className = `chess-piece ${piece.color === 'w' ? 'white' : 'black'}`;
                    pieceEl.textContent = PIECES[piece.color === 'w' ? piece.type.toUpperCase() : piece.type];
                    squareBtn.appendChild(pieceEl);
                }
                if ((orientation === 'white' && rank === 1) || (orientation === 'black' && rank === 8)) {
                    const coord = document.createElement('span');
                    coord.className = 'chess-coordinate';
                    coord.textContent = file;
                    squareBtn.appendChild(coord);
                }
                boardEl.appendChild(squareBtn);
            });
        });
    }

    function updateChessRoomView(room) {
        chessState.roomData = room;
        chessState.role = inferChessRole(room);
        if (!room) {
            chessState.approvalPromptKey = '';
            chessState.approvalPromptOpen = false;
            chessState.sidebarLayoutMode = '';
            toggleChessPanels(false);
            document.getElementById('chessRoomCodeDisplay').textContent = '------';
            document.getElementById('chessHostPlayerName').textContent = 'Waiting for host';
            document.getElementById('chessGuestPlayerName').textContent = 'No opponent yet';
            document.getElementById('chessMoveList').innerHTML = '<li>Room not started yet.</li>';
            document.getElementById('chessMatchHeadline').textContent = 'No live room';
            document.getElementById('chessRoleHint').textContent = 'Choose Host Room or Find Room to begin.';
            document.getElementById('chessApprovalCard')?.classList.add('hidden');
            document.getElementById('chessWaitingCard')?.classList.add('hidden');
            document.getElementById('chessApprovalPopup')?.classList.add('hidden');
            if (document.getElementById('chessTurnChip')) document.getElementById('chessTurnChip').textContent = 'Waiting';
            if (document.getElementById('chessRoomModeChip')) document.getElementById('chessRoomModeChip').textContent = 'Lobby Ready';
            updateChessActionState(null);
            updateChessSidebarLayout(null);
            updateChessWarningBanner(null);
            closeChessWarningModal(true);
            renderChessChat(null);
            updateChessResultModal(null);
            hideChessChatToast(true);
            renderChessBoard(null);
            setChessNotice('Create a room or join an approved room to begin.');
            return;
        }
        if (room.status !== 'active' || isChessPaused(room)) {
            chessState.selectedSquare = null;
            chessState.legalTargets = [];
        }
        toggleChessPanels(true);
        updateChessSidebar(room);
        updateChessSidebarLayout(room);
        updateChessMoveFeed(room);
        renderChessChat(room);
        updateChessWarningBanner(room);
        updateChessResultModal(room);
        renderChessBoard(room);
        if (room.status === 'finished') {
            setChessNotice(room.resultText || 'Match finished.');
        } else if (isChessPaused(room)) {
            const pauseTarget = room.status === 'active' ? 'match' : 'room';
            setChessNotice(room.pausedBy
                ? `${room.pausedBy} paused the ${pauseTarget}. Resume anytime from the same state.`
                : `The ${pauseTarget} is paused. Resume anytime from the same state.`);
        } else if (room.status === 'active') {
            const lastMoveText = room?.lastMove?.san ? `Last move: ${room.lastMove.san} by ${room.lastMove.byName || 'Player'}. ` : '';
            setChessNotice(`${room.currentTurn === 'w' ? 'White' : 'Black'} to move. ${lastMoveText}${room.resultText || 'Use clean moves and keep pressure.'}`);
        } else {
            setChessNotice(chessState.role === 'host' ? 'Room created. Share the code and approve your opponent.' : 'Room waiting for host approval.');
        }
    }

    function listenToChessRoom(code) {
        cleanupChessSubscription();
        chessState.roomCode = code;
        chessState.unsubscribe = onValue(getChessRoomRef(code), (snapshot) => {
            const room = snapshot.val();
            if (!room) {
                chessState.roomCode = '';
                chessState.selectedSquare = null;
                chessState.legalTargets = [];
                updateChessRoomView(null);
                return;
            }
            updateChessRoomView(room);
            maybePromptChessApproval(room);
        });
    }

    function getCurrentChessColor() {
        return chessState.role === 'host' ? 'w' : chessState.role === 'guest' ? 'b' : '';
    }

    async function pushChessMove(from, to) {
        if (!chessState.roomCode || !chessState.roomData) return;
        const room = chessState.roomData;
        if (isChessPaused(room)) {
            setChessNotice('Match is paused. Resume to continue.');
            return;
        }
        const game = getChessInstance(room.fen);
        if (!game) return;
        const move = game.move({ from, to, promotion: 'q' });
        if (!move) {
            setChessNotice('Illegal move. Pick a valid square.');
            playChessTone('alert');
            return;
        }
        const nextMoves = [...(room.moveLog || []), {
            san: move.san,
            from: move.from,
            to: move.to,
            by: chessState.role,
            byName: chessState.role === 'host' ? room.host?.name : room.guest?.name,
            moveNo: Math.ceil(game.history().length / 2)
        }];
        const payload = {
            fen: game.fen(),
            currentTurn: game.turn(),
            moveLog: nextMoves,
            lastMove: {
                san: move.san,
                from: move.from,
                to: move.to,
                by: chessState.role,
                byName: chessState.role === 'host' ? room.host?.name : room.guest?.name,
                createdAt: Date.now()
            },
            updatedAt: Date.now(),
            status: chessIsGameOver(game) ? 'finished' : 'active',
            resultText: '',
            warningType: '',
            warningText: '',
            finishReason: '',
            winnerColor: '',
            winnerName: '',
            loserName: ''
        };
        if (chessIsCheckmate(game)) {
            const winnerColor = move.color;
            payload.finishReason = 'checkmate';
            payload.winnerColor = winnerColor;
            payload.winnerName = winnerColor === 'w' ? (room.host?.name || 'White') : (room.guest?.name || 'Black');
            payload.loserName = winnerColor === 'w' ? (room.guest?.name || 'Black') : (room.host?.name || 'White');
            payload.warningType = 'checkmate';
            payload.warningText = `Checkmate. ${payload.winnerName} wins over ${payload.loserName}.`;
            payload.resultText = `${payload.winnerName} wins by checkmate.`;
        } else if (chessIsDraw(game)) {
            payload.finishReason = 'draw';
            payload.resultText = 'Draw game. Strong defense from both players.';
        } else if (chessInCheck(game)) {
            const checkedColor = game.turn();
            const checkedName = checkedColor === 'w' ? (room.host?.name || 'White') : (room.guest?.name || 'Black');
            payload.warningType = 'check';
            payload.warningText = `Check on ${checkedName}.`;
            payload.resultText = `${checkedName} is in check.`;
        } else {
            payload.resultText = `${payload.lastMove.byName || 'Player'} played ${move.san}.`;
        }
        await update(getChessRoomRef(chessState.roomCode), payload);
        chessState.selectedSquare = null;
        chessState.legalTargets = [];
        playChessTone(move.captured ? 'capture' : 'move');
        if (payload.status === 'finished') playChessTone('win');
    }

    function handleChessSquareClick(square) {
        const room = chessState.roomData;
        if (!room || room.status !== 'active') return;
        if (isChessPaused(room)) {
            setChessNotice(room.pausedBy ? `${room.pausedBy} paused the match. Resume to continue.` : 'Match is paused. Resume to continue.');
            return;
        }
        const color = getCurrentChessColor();
        if (!color || room.currentTurn !== color) {
            setChessNotice('Wait for your turn.');
            return;
        }
        const game = getChessInstance(room.fen);
        if (!game) return;
        const piece = game.get(square);
        if (chessState.selectedSquare) {
            const chosen = chessState.legalTargets.find(move => move.to === square);
            if (chosen) {
                pushChessMove(chessState.selectedSquare, square);
                return;
            }
            if (piece && piece.color === color) {
                chessState.selectedSquare = square;
                chessState.legalTargets = game.moves({ square, verbose: true });
                renderChessBoard(room);
                return;
            }
            chessState.selectedSquare = null;
            chessState.legalTargets = [];
            renderChessBoard(room);
            return;
        }
        if (piece && piece.color === color) {
            chessState.selectedSquare = square;
            chessState.legalTargets = game.moves({ square, verbose: true });
            renderChessBoard(room);
        }
    }

    function generateChessRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 6; i++) result += chars[Math.floor(Math.random() * chars.length)];
        return result;
    }

    window.switchChessMode = function (mode) {
        setChessMode(mode);
    };

    window.sendChessChatMessage = sendChessChatMessage;
    window.handleChessChatKey = function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendChessChatMessage();
        }
    };
    window.closeChessWarningModal = closeChessWarningModal;
    window.closeChessResultModal = closeChessResultModal;

    window.prepareChessOverlay = function () {
        const storedName = getChessPlayerName();
        document.getElementById('chessHostNameInput').value = storedName;
        document.getElementById('chessGuestNameInput').value = storedName;
        document.getElementById('chessRoomCodeInput').value = '';
        if (chessState.roomData && chessState.roomCode) {
            updateChessRoomView(chessState.roomData);
            return;
        }
        chessState.selectedSquare = null;
        chessState.legalTargets = [];
        updateChessRoomView(null);
        setChessMode('host');
    };

    window.createChessRoom = async function () {
        const hostName = (document.getElementById('chessHostNameInput')?.value || '').trim();
        if (!hostName) {
            setChessNotice('Enter your host name before creating the room.');
            return;
        }
        setChessPlayerName(hostName);
        const game = getChessInstance();
        if (!game) {
            setChessNotice('The chess engine did not load. Refresh the page and try again.');
            return;
        }
        let code = generateChessRoomCode();
        let snapshot = await get(getChessRoomRef(code));
        while (snapshot.exists()) {
            code = generateChessRoomCode();
            snapshot = await get(getChessRoomRef(code));
        }
        const roomPayload = {
            code,
            status: 'waiting',
            fen: game.fen(),
            currentTurn: 'w',
            paused: false,
            pausedBy: '',
            pausedAt: 0,
            moveLog: [],
            resultText: '',
            lastMove: null,
            warningType: '',
            warningText: '',
            finishReason: '',
            winnerColor: '',
            winnerName: '',
            loserName: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            host: { name: hostName, sessionId: chessState.sessionId, color: 'w' },
            guest: null,
            guestRequest: null
        };
        chessState.role = 'host';
        chessState.roomCode = code;
        updateChessRoomView(roomPayload);
        setChessNotice(`Room ${code} created. Share the code and wait for join request.`);
        try {
            await set(getChessRoomRef(code), roomPayload);
            listenToChessRoom(code);
            playChessTone('move');
        } catch (error) {
            chessState.roomCode = '';
            chessState.role = '';
            updateChessRoomView(null);
            setChessNotice(`The room could not be created. Firebase error: ${error?.message || 'Unknown error'}`);
        }
    };

    window.joinChessRoom = async function () {
        const guestName = (document.getElementById('chessGuestNameInput')?.value || '').trim();
        const code = (document.getElementById('chessRoomCodeInput')?.value || '').trim().toUpperCase();
        if (!guestName || !code) {
            setChessNotice('Enter your name and room code before joining.');
            return;
        }
        const roomRef = getChessRoomRef(code);
        try {
            const snapshot = await get(roomRef);
            if (!snapshot.exists()) {
                setChessNotice('Room not found. Check the code and try again.');
                playChessTone('alert');
                return;
            }
            const room = snapshot.val();
            if (room?.guest && room.guest.sessionId !== chessState.sessionId) {
                setChessNotice('This room already has two players. Ask host for a fresh room.');
                playChessTone('alert');
                return;
            }
            if (room?.guestRequest?.status === 'pending' && room.guestRequest.sessionId !== chessState.sessionId) {
                setChessNotice(`${room.guestRequest.name || 'Another player'} is already waiting for host approval. Try again in a moment.`);
                playChessTone('alert');
                return;
            }
            setChessPlayerName(guestName);
            const requestTime = Date.now();
            await update(roomRef, {
                guestRequest: {
                    name: guestName,
                    sessionId: chessState.sessionId,
                    status: 'pending',
                    requestedAt: room?.guestRequest?.sessionId === chessState.sessionId
                        ? (room.guestRequest.requestedAt || requestTime)
                        : requestTime
                },
                updatedAt: requestTime
            });
            chessState.role = 'guestPending';
            listenToChessRoom(code);
            setChessNotice(`Join request sent to room ${code}. Waiting for host approval.`);
            playChessTone('move');
        } catch (error) {
            setChessNotice(`The join request failed. Firebase error: ${error?.message || 'Unknown error'}`);
        }
    };

    window.approveChessGuest = async function () {
        if (chessState.role !== 'host' || !chessState.roomCode || !chessState.roomData?.guestRequest) return;
        const room = chessState.roomData;
        const game = getChessInstance();
        if (!game) return;
        chessState.approvalPromptKey = '';
        await update(getChessRoomRef(chessState.roomCode), {
            guest: {
                name: room.guestRequest.name,
                sessionId: room.guestRequest.sessionId,
                color: 'b'
            },
            guestRequest: null,
            status: 'active',
            fen: game.fen(),
            currentTurn: 'w',
            moveLog: [],
            lastMove: null,
            resultText: 'Match approved. White moves first.',
            warningType: '',
            warningText: '',
            finishReason: '',
            winnerColor: '',
            winnerName: '',
            loserName: '',
            updatedAt: Date.now()
        });
        playChessTone('win');
    };

    window.declineChessGuest = async function () {
        if (chessState.role !== 'host' || !chessState.roomCode || !chessState.roomData?.guestRequest) return;
        chessState.approvalPromptKey = '';
        await update(getChessRoomRef(chessState.roomCode), {
            guestRequest: {
                ...chessState.roomData.guestRequest,
                status: 'declined',
                updatedAt: Date.now()
            }
        });
        playChessTone('alert');
    };

    window.copyChessRoomCode = async function () {
        if (!chessState.roomCode) {
            setChessNotice('Create a room first to copy the code.');
            return;
        }
        try {
            await navigator.clipboard.writeText(chessState.roomCode);
            setChessNotice(`Room code ${chessState.roomCode} copied. Share it with your opponent.`);
        } catch (error) {
            setChessNotice(`Room code: ${chessState.roomCode}`);
        }
    };

    window.openExternalChatForChess = function (event) {
        event?.stopPropagation?.();
        toggleChat(true);
        const chatInput = document.getElementById('chatMessage');
        if (chatInput && chessState.roomCode && chessState.role === 'host') {
            chatInput.value = `Chess room code: ${chessState.roomCode} // ${chessState.roomData?.host?.name || 'Host'}`;
        }
        chatInput?.focus();
    };

    window.shareChessCodeToExternalChat = async function () {
        if (!chessState.roomCode || chessState.role !== 'host') {
            setChessNotice('The host can share the code only after creating a room.');
            return;
        }
        try {
            const createdAt = Date.now();
            const autoDeleteAt = createdAt + 300000;
            const commentRef = await push(commentsRef, {
                message: `Chess room code: ${chessState.roomCode} // ${chessState.roomData?.host?.name || 'Host'}`,
                username: 'Chess Host',
                timestamp: createdAt,
                autoDeleteAt,
                messageType: 'game_code'
            });
            scheduleExternalCodeMessageDeletion(commentRef.key, autoDeleteAt);
            toggleChat(true);
            setChessNotice(`Room code ${chessState.roomCode} was shared in external chat.`);
        } catch (error) {
            setChessNotice(`External chat share failed. Firebase error: ${error?.message || 'Unknown error'}`);
        }
    };

    window.pasteChessCodeFromClipboard = async function () {
        const input = document.getElementById('chessRoomCodeInput');
        if (!input) return;
        try {
            const clipboardText = await navigator.clipboard.readText();
            const match = (clipboardText || '').toUpperCase().match(/[A-Z0-9]{6}/);
            if (!match) {
                setChessNotice('No valid 6-letter room code was found in the clipboard.');
                return;
            }
            input.value = match[0];
            setChessNotice(`Room code ${match[0]} was pasted. Click Request Entry to continue.`);
        } catch (error) {
            setChessNotice('Allow clipboard access or paste the code manually.');
        }
    };

    async function sendChessChatMessage() {
        const room = chessState.roomData;
        const input = document.getElementById('chessChatInput');
        if (!room || !input) {
            setChessNotice('Create or join a room before sending chat.');
            return;
        }
        if (!canLocalChatInChess(room)) {
            setChessNotice('Room chat becomes available once the match is active.');
            return;
        }

        const text = input.value.trim();
        if (!text) return;

        const name = chessState.role === 'host' ? (room.host?.name || 'White') : (room.guest?.name || 'Black');
        try {
            await push(getChessMessagesRef(room.code), {
                name,
                role: chessState.role,
                sessionId: chessState.sessionId,
                text,
                createdAt: Date.now()
            });
            input.value = '';
        } catch (error) {
            setChessNotice(`Chat send failed. Firebase error: ${error?.message || 'Unknown error'}`);
        }
    }

    window.resetChessBoardIfHost = async function () {
        if (chessState.role !== 'host' || !chessState.roomCode) {
            setChessNotice('Only the host can restart the match.');
            return;
        }
        const game = getChessInstance();
        if (!game) return;
        await update(getChessRoomRef(chessState.roomCode), {
            fen: game.fen(),
            currentTurn: 'w',
            paused: false,
            pausedBy: '',
            pausedAt: 0,
            moveLog: [],
            lastMove: null,
            status: chessState.roomData?.guest ? 'active' : 'waiting',
            resultText: chessState.roomData?.guest ? 'Fresh board. White opens the rematch.' : 'Board reset. Waiting for a guest.',
            warningType: '',
            warningText: '',
            finishReason: '',
            winnerColor: '',
            winnerName: '',
            loserName: '',
            updatedAt: Date.now()
        });
    };

    window.toggleChessPause = async function () {
        const room = chessState.roomData;
        if (!room) {
            setChessNotice('Create or join a room before using pause.');
            return;
        }
        if (!canControlChessPause()) {
            setChessNotice('Only seated players can control pause and resume.');
            return;
        }
        if (room.status === 'finished') {
            setChessNotice('Finished match cannot be paused. Restart for a new board.');
            return;
        }

        const actor = chessState.role === 'host'
            ? (room.host?.name || 'White')
            : (room.guest?.name || 'Black');
        const nextPaused = !isChessPaused(room);
        const pauseTarget = room.status === 'active' ? 'match' : 'room';
        const resultText = nextPaused
            ? `${actor} paused the ${pauseTarget}. State is saved and can resume anytime.`
            : `${actor} resumed the ${pauseTarget}. Everything continues from the same state.`;
        const optimisticRoom = {
            ...room,
            paused: nextPaused,
            pausedBy: nextPaused ? actor : '',
            pausedAt: nextPaused ? Date.now() : 0,
            resultText
        };

        try {
            updateChessRoomView(optimisticRoom);
            await update(getChessRoomRef(chessState.roomCode), {
                paused: nextPaused,
                pausedBy: nextPaused ? actor : '',
                pausedAt: nextPaused ? Date.now() : 0,
                resultText,
                updatedAt: Date.now()
            });
        } catch (error) {
            updateChessRoomView(room);
            setChessNotice(`Pause state update failed. Firebase error: ${error?.message || 'Unknown error'}`);
        }
    };

    async function internalLeaveChessRoom(closeOverlay) {
        const code = chessState.roomCode;
        const role = chessState.role;
        cleanupChessSubscription();
        chessState.roomCode = '';
        chessState.role = '';
        chessState.roomData = null;
        chessState.selectedSquare = null;
        chessState.legalTargets = [];
        if (code) {
            try {
                const roomRef = getChessRoomRef(code);
                if (role === 'host') {
                    await remove(roomRef);
                } else if (role === 'guest') {
                    const game = getChessInstance();
                    await update(roomRef, {
                        guest: null,
                        guestRequest: null,
                        status: 'waiting',
                        fen: game.fen(),
                        currentTurn: 'w',
                        paused: false,
                        pausedBy: '',
                        pausedAt: 0,
                        moveLog: [],
                        lastMove: null,
                        resultText: 'Guest left. Waiting for a new opponent.',
                        warningType: '',
                        warningText: '',
                        finishReason: '',
                        winnerColor: '',
                        winnerName: '',
                        loserName: '',
                        updatedAt: Date.now()
                    });
                } else if (role === 'guestPending') {
                    await update(roomRef, { guestRequest: null, updatedAt: Date.now() });
                }
            } catch (error) { }
        }
        updateChessRoomView(null);
        if (closeOverlay) document.getElementById('chessGameOverlay')?.classList.remove('active');
    }

    window.leaveChessRoom = function () {
        internalLeaveChessRoom(true).then(() => openGameHub());
    };

    const originalBackToHub = window.backToHub;
    window.backToHub = function (overlayId) {
        if (overlayId === 'chessGameOverlay') {
            document.getElementById('chessGameOverlay')?.classList.remove('active');
            openGameHub();
            return;
        }
        if (originalBackToHub) originalBackToHub(overlayId);
    };
})();

(function () {
    const CARROM_ROOM_PREFIX = 'carromRooms';
    const CARROM_SESSION_KEY = 'carromSessionId';
    const CARROM_PLAYER_NAME_KEY = 'carromPlayerName';
    const CARROM_ALLOWED_SEATS = {
        2: [0, 2],
        4: [0, 1, 2, 3]
    };
    const CARROM_SEATS = [
        { label: 'South Seat', short: 'South', lane: 'South Baseline', meta: 'Host baseline' },
        { label: 'West Seat', short: 'West', lane: 'West Rail', meta: 'Left rail' },
        { label: 'North Seat', short: 'North', lane: 'North Baseline', meta: 'Opposite angle' },
        { label: 'East Seat', short: 'East', lane: 'East Rail', meta: 'Right rail' }
    ];
    const CARROM_TEAMS = {
        ivory: { label: 'Ivory Team', color: '#f8fafc', stroke: '#f59e0b' },
        ebony: { label: 'Ebony Team', color: '#0f172a', stroke: '#94a3b8' },
        queen: { label: 'Queen', color: '#dc2626', stroke: '#fca5a5' }
    };
    const CARROM_POWER_DISTANCE = 170;
    const carromState = {
        mode: 'host',
        roomSize: 2,
        gameMode: 'team',
        sessionId: localStorage.getItem(CARROM_SESSION_KEY) || `carrom_${Math.random().toString(36).slice(2, 10)}`,
        unsubscribe: null,
        roomCode: '',
        roomData: null,
        seatIndex: null,
        canvas: null,
        ctx: null,
        canvasBound: false,
        localStrikerPercent: 50,
        aiming: false,
        aimPointerId: null,
        aimPoint: null,
        aimPower: 0,
        simBoard: null,
        simFrame: 0,
        hostResolvingShotId: '',
        lastVisualShotId: '',
        approvalPromptKey: '',
        approvalPromptOpen: false,
        brandFlashKey: '',
        brandFlashText: 'SHIVANG',
        brandFlashStartedAt: 0,
        brandFlashUntil: 0,
        brandFlashFrame: 0,
        brandFlashHue: 0,
        boardChatPreviewKey: '',
        boardChatPreviewTimer: 0,
        coinsToastTimer: 0,
        lastCoinsSnapshot: '',
        aimStrikerLocked: false,
        aimSyncTimer: 0,
        lastAimSyncAt: 0,
        lastAimSyncKey: '',
        shotWatchdogTimer: 0,
        rightClickArmedAt: 0,
        resultModalKey: ''
    };
    localStorage.setItem(CARROM_SESSION_KEY, carromState.sessionId);

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function getCarromGeometry(size) {
        const playInset = size * 0.108;
        const playMin = playInset;
        const playMax = size - playInset;
        return {
            size,
            center: size / 2,
            playMin,
            playMax,
            playSize: playMax - playMin,
            pocketRadius: size * 0.04,
            coinRadius: size * 0.0198,
            strikerRadius: size * 0.026,
            baselineInset: size * 0.13,
            laneHalf: size * 0.195,
            pocketCenters: [
                { x: playMin + 4, y: playMin + 4 },
                { x: playMax - 4, y: playMin + 4 },
                { x: playMin + 4, y: playMax - 4 },
                { x: playMax - 4, y: playMax - 4 }
            ]
        };
    }

    function getCarromPlayerName() {
        return (localStorage.getItem(CARROM_PLAYER_NAME_KEY) || '').trim();
    }

    function setCarromPlayerName(name) {
        localStorage.setItem(CARROM_PLAYER_NAME_KEY, name.trim());
    }

    function getCarromRoomRef(code) {
        return dbRef(db, `${CARROM_ROOM_PREFIX}/${code}`);
    }

    function getCarromMessagesRef(code) {
        return dbRef(db, `${CARROM_ROOM_PREFIX}/${code}/messages`);
    }

    function generateCarromRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let index = 0; index < 6; index++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }

    function getAllowedCarromSeats(format) {
        return CARROM_ALLOWED_SEATS[format] || CARROM_ALLOWED_SEATS[2];
    }

    function getSeatInfo(seatIndex) {
        return CARROM_SEATS[seatIndex] || CARROM_SEATS[0];
    }

    function getCarromTeamForSeat(format, seatIndex) {
        if (format === 2) {
            return seatIndex === 0 ? 'ivory' : 'ebony';
        }
        return seatIndex === 0 || seatIndex === 2 ? 'ivory' : 'ebony';
    }

    function getCarromGameMode(room) {
        if (room?.gameMode === 'coinpoints') return 'coinpoints';
        if ((room?.format || carromState.roomSize) === 2) return 'duel';
        return room?.gameMode === 'coinpoints' ? 'coinpoints' : room?.gameMode === 'individual' ? 'individual' : 'team';
    }

    function isCarromPlayerPointsMode(gameMode) {
        return gameMode === 'individual' || gameMode === 'coinpoints';
    }

    function getActiveCarromTeamTurnRequest(room) {
        const request = room?.board?.teamTurnRequest || null;
        if (!request || room?.format !== 4 || getCarromGameMode(room) !== 'team') return null;
        const turnSeat = room?.board?.turnSeat ?? 0;
        if (request.turnSeat !== turnSeat) return null;
        if (getCarromTeamForSeat(room.format, request.requestSeat) !== getCarromTeamForSeat(room.format, turnSeat)) return null;
        return request;
    }

    function setCarromGameMode(mode) {
        carromState.gameMode = mode === 'coinpoints' ? 'coinpoints' : mode === 'individual' ? 'individual' : 'team';
        document.getElementById('carromModeTeamBtn')?.classList.toggle('active', carromState.gameMode === 'team');
        document.getElementById('carromModeIndividualBtn')?.classList.toggle('active', carromState.gameMode === 'individual');
        document.getElementById('carromModeCoinPointsBtn')?.classList.toggle('active', carromState.gameMode === 'coinpoints');
    }

    function updateCarromModeVisibility() {
        document.getElementById('carromModeBlock')?.classList.remove('hidden');
        document.getElementById('carromModeIndividualBtn')?.classList.toggle('hidden', carromState.roomSize !== 4);
        if (carromState.roomSize !== 4 && carromState.gameMode === 'individual') {
            setCarromGameMode('team');
        }
    }

    function getCarromSeatTargetLabel(room) {
        return isCarromPlayerPointsMode(getCarromGameMode(room)) ? 'Player' : 'Team';
    }

    function getCarromControllingSeats(room) {
        if (!room || carromState.seatIndex == null) return [];
        if (room.format === 2 || isCarromPlayerPointsMode(getCarromGameMode(room))) {
            return [room.board?.turnSeat ?? 0];
        }
        const currentTurnSeat = room.board?.turnSeat ?? 0;
        const request = getActiveCarromTeamTurnRequest(room);
        const approvedSeat = request?.status === 'approved' ? request.approvedSeat : null;
        return approvedSeat != null ? [currentTurnSeat, approvedSeat] : [currentTurnSeat];
    }

    function canControlCurrentCarromTurn(room) {
        return getCarromControllingSeats(room).includes(carromState.seatIndex);
    }

    function getActiveCarromControlSeat(room) {
        if (!room) return 0;
        if (room.board?.aimPreview?.controlSeat != null) return Number(room.board.aimPreview.controlSeat);
        if (room.board?.running && room.board?.shot?.seatIndex != null) return Number(room.board.shot.seatIndex);
        if (canLocalPlayCarrom(room)) return carromState.seatIndex ?? (room.board?.turnSeat ?? 0);
        return room.board?.turnSeat ?? 0;
    }

    function getCarromAimPreview(room) {
        return room?.board?.aimPreview || null;
    }

    function getCarromAimPreviewKey(room) {
        const preview = getCarromAimPreview(room);
        if (!preview) return 'none';
        return [
            preview.controlSeat ?? '',
            Math.round(Number(preview.strikerPercent ?? 0)),
            preview.locked ? 1 : 0,
            Number(Number(preview.power ?? 0).toFixed(2)),
            preview.aimPoint?.x != null ? Math.round(Number(preview.aimPoint.x) / 4) * 4 : '',
            preview.aimPoint?.y != null ? Math.round(Number(preview.aimPoint.y) / 4) * 4 : ''
        ].join(':');
    }

    function getCarromRoomStableSignature(room) {
        if (!room) return 'no-room';
        return JSON.stringify({
            code: room.code || '',
            format: room.format || 0,
            status: room.status || '',
            gameMode: getCarromGameMode(room),
            resultText: room.resultText || '',
            players: getAllowedCarromSeats(room.format).map(seatIndex => ({
                seatIndex,
                name: room.players?.[seatIndex]?.name || '',
                sessionId: room.players?.[seatIndex]?.sessionId || ''
            })),
            joinRequests: (room.joinRequests || []).map(request => ({
                id: request.id || '',
                status: request.status || '',
                sessionId: request.sessionId || '',
                updatedAt: request.updatedAt || 0
            })),
            board: {
                running: !!room.board?.running,
                turnSeat: room.board?.turnSeat ?? 0,
                paused: !!room.board?.paused,
                pausedBy: room.board?.pausedBy || '',
                resultText: room.board?.resultText || '',
                winnerLabel: room.board?.winnerLabel || '',
                teamTurnRequest: room.board?.teamTurnRequest
                    ? {
                        status: room.board.teamTurnRequest.status || '',
                        turnSeat: room.board.teamTurnRequest.turnSeat ?? '',
                        requestSeat: room.board.teamTurnRequest.requestSeat ?? '',
                        approvedSeat: room.board.teamTurnRequest.approvedSeat ?? ''
                    }
                    : null,
                shotId: room.board?.shot?.id || '',
                scores: room.board?.scores || {},
                playerScores: room.board?.playerScores || {},
                pieces: (room.board?.pieces || []).map(piece => ({
                    id: piece.id,
                    x: piece.x,
                    y: piece.y,
                    pocketed: !!piece.pocketed
                }))
            },
            brandFlashId: room.brandFlash?.id || '',
            moveLogCount: Array.isArray(room.moveLog) ? room.moveLog.length : 0,
            messageCount: Array.isArray(room.messages) ? room.messages.length : 0,
            lastMessageAt: Array.isArray(room.messages) && room.messages.length ? (room.messages[room.messages.length - 1]?.createdAt || 0) : 0
        });
    }

    function isCarromAimPreviewOnlyUpdate(previousRoom, nextRoom) {
        if (!previousRoom || !nextRoom) return false;
        if ((previousRoom.code || '') !== (nextRoom.code || '')) return false;
        return getCarromRoomStableSignature(previousRoom) === getCarromRoomStableSignature(nextRoom)
            && getCarromAimPreviewKey(previousRoom) !== getCarromAimPreviewKey(nextRoom);
    }

    function getOpponentTeam(team) {
        return team === 'ivory' ? 'ebony' : 'ivory';
    }

    function getTeamLabel(team) {
        return CARROM_TEAMS[team]?.label || 'Team';
    }

    function createCarromRack() {
        const geo = getCarromGeometry(760);
        const pieces = [];
        const addPiece = (id, type, x, y) => {
            pieces.push({
                id,
                type,
                x,
                y,
                pocketed: false
            });
        };

        addPiece('queen', 'queen', geo.center, geo.center);

        const innerRadius = geo.coinRadius * 2.25;
        const outerRadius = geo.coinRadius * 4.45;
        for (let index = 0; index < 6; index++) {
            const angle = (Math.PI * 2 * index) / 6;
            addPiece(
                `inner_${index}`,
                index % 2 === 0 ? 'ivory' : 'ebony',
                geo.center + Math.cos(angle) * innerRadius,
                geo.center + Math.sin(angle) * innerRadius
            );
        }
        for (let index = 0; index < 12; index++) {
            const angle = (Math.PI * 2 * index) / 12;
            addPiece(
                `outer_${index}`,
                index % 2 === 0 ? 'ebony' : 'ivory',
                geo.center + Math.cos(angle) * outerRadius,
                geo.center + Math.sin(angle) * outerRadius
            );
        }
        return pieces;
    }

    function buildInitialCarromBoard(format) {
        const gameMode = carromState.gameMode === 'coinpoints' ? 'coinpoints' : (format === 4 ? carromState.gameMode : 'duel');
        return {
            format,
            gameMode,
            pieces: createCarromRack(),
            scores: { ivory: 0, ebony: 0 },
            playerScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
            turnSeat: 0,
            turnNumber: 1,
            running: false,
            paused: false,
            pausedBy: '',
            pausedAt: 0,
            shot: null,
            aimPreview: null,
            teamTurnRequest: null,
            queenCovered: false,
            queenOwnerSeat: null,
            queenPendingOwnerSeat: null,
            queenPendingTeam: '',
            queenReturned: false,
            resultText: `${format}-player ${gameMode === 'coinpoints' ? 'coin points' : gameMode === 'individual' ? 'individual' : gameMode === 'team' ? 'team' : 'duel'} room ready. Fill the seats and break the board.`,
            winnerTeam: '',
            winnerSeats: [],
            winnerLabel: ''
        };
    }

    function normalizeCarromRoomData(rawRoom) {
        if (!rawRoom) return null;
        const format = Number(rawRoom.format) === 4 ? 4 : 2;
        const baseBoard = buildInitialCarromBoard(format);
        const rawBoard = rawRoom.board || {};
        const joinRequests = (Array.isArray(rawRoom.joinRequests)
            ? rawRoom.joinRequests.map(request => ({ ...request }))
            : Object.entries(rawRoom.joinRequests || {}).map(([id, request]) => ({ id, ...(request || {}) })))
            .filter(request => request && request.sessionId)
            .sort((left, right) => (left?.requestedAt || 0) - (right?.requestedAt || 0));
        const pieces = Array.isArray(rawBoard.pieces)
            ? rawBoard.pieces.map(piece => ({ ...piece }))
            : Object.values(rawBoard.pieces || {}).map(piece => ({ ...piece }));
        return {
            ...rawRoom,
            format,
            gameMode: rawRoom.gameMode || rawBoard.gameMode || (format === 4 ? 'team' : 'duel'),
            players: { ...(rawRoom.players || {}) },
            joinRequests,
            moveLog: Array.isArray(rawRoom.moveLog) ? rawRoom.moveLog : Object.values(rawRoom.moveLog || {}),
            messages: (Array.isArray(rawRoom.messages) ? rawRoom.messages : Object.values(rawRoom.messages || {}))
                .sort((left, right) => (left?.createdAt || 0) - (right?.createdAt || 0)),
            board: {
                ...baseBoard,
                ...rawBoard,
                pieces: pieces.length ? pieces : baseBoard.pieces,
                scores: { ivory: 0, ebony: 0, ...(rawBoard.scores || {}) },
                playerScores: { 0: 0, 1: 0, 2: 0, 3: 0, ...(rawBoard.playerScores || {}) },
                paused: !!rawBoard.paused,
                pausedBy: rawBoard.pausedBy || '',
                pausedAt: rawBoard.pausedAt || 0,
                shot: rawBoard.shot || null,
                aimPreview: rawBoard.aimPreview || null,
                queenCovered: !!rawBoard.queenCovered,
                queenOwnerSeat: rawBoard.queenOwnerSeat ?? null,
                queenPendingOwnerSeat: rawBoard.queenPendingOwnerSeat ?? null,
                queenPendingTeam: rawBoard.queenPendingTeam || '',
                queenReturned: !!rawBoard.queenReturned,
                winnerSeats: Array.isArray(rawBoard.winnerSeats) ? rawBoard.winnerSeats : []
            },
            resultText: rawRoom.resultText || rawBoard.resultText || baseBoard.resultText,
            status: rawRoom.status || 'waiting'
        };
    }

    function cloneCarromPieces(pieces) {
        return (pieces || []).map(piece => ({ ...piece }));
    }

    function getCarromSeatBySession(room, sessionId) {
        if (!room || !room.players) return null;
        return getAllowedCarromSeats(room.format).find(seatIndex => room.players?.[seatIndex]?.sessionId === sessionId) ?? null;
    }

    function getOccupiedCarromSeats(room) {
        if (!room) return [];
        return getAllowedCarromSeats(room.format).filter(seatIndex => room.players?.[seatIndex]);
    }

    function serializeCarromJoinRequests(joinRequests) {
        return (joinRequests || []).reduce((acc, request) => {
            if (!request?.id || !request?.sessionId) return acc;
            acc[request.id] = {
                id: request.id,
                name: request.name || 'Player',
                sessionId: request.sessionId,
                status: request.status || 'pending',
                requestedAt: request.requestedAt || Date.now(),
                updatedAt: request.updatedAt || request.requestedAt || Date.now()
            };
            return acc;
        }, {});
    }

    function getPendingCarromJoinRequests(room) {
        return (room?.joinRequests || []).filter(request => request?.status === 'pending');
    }

    function getCurrentCarromPendingRequest(room) {
        const pendingRequests = getPendingCarromJoinRequests(room);
        if (!pendingRequests.length) {
            carromState.approvalQueueIndex = 0;
            return null;
        }
        const maxIndex = pendingRequests.length - 1;
        const nextIndex = clamp(carromState.approvalQueueIndex, 0, maxIndex);
        carromState.approvalQueueIndex = nextIndex;
        return pendingRequests[nextIndex];
    }

    function getLatestCarromJoinRequestForSession(room, sessionId) {
        if (!room || !sessionId) return null;
        return [...(room.joinRequests || [])].reverse().find(request => request?.sessionId === sessionId) || null;
    }

    function getCarromJoinRequestKey(request) {
        if (!request?.id) return '';
        return `${request.id}:${request.requestedAt || 0}`;
    }

    function isCarromRoomFull(room) {
        return getOccupiedCarromSeats(room).length === room.format;
    }

    function getNextOpenCarromSeat(room) {
        return getAllowedCarromSeats(room.format).find(seatIndex => !room.players?.[seatIndex]) ?? null;
    }

    function getNextCarromTurnSeat(room, currentSeat) {
        const occupiedSeats = getOccupiedCarromSeats(room);
        if (!occupiedSeats.length) return 0;
        const currentIndex = occupiedSeats.indexOf(currentSeat);
        if (currentIndex === -1) return occupiedSeats[0];
        return occupiedSeats[(currentIndex + 1) % occupiedSeats.length];
    }

    function getCarromBaselinePoint(seatIndex, percent, geo) {
        const progress = clamp(Number(percent) || 50, 5, 95) / 100;
        const min = geo.center - geo.laneHalf;
        const max = geo.center + geo.laneHalf;
        if (seatIndex === 0) {
            return { x: min + (max - min) * progress, y: geo.playMax - geo.baselineInset };
        }
        if (seatIndex === 1) {
            return { x: geo.playMin + geo.baselineInset, y: min + (max - min) * progress };
        }
        if (seatIndex === 2) {
            return { x: max - (max - min) * progress, y: geo.playMin + geo.baselineInset };
        }
        return { x: geo.playMax - geo.baselineInset, y: max - (max - min) * progress };
    }

    function getCarromViewTurns() {
        return carromState.seatIndex == null ? 0 : (carromState.seatIndex % 4 + 4) % 4;
    }

    function rotateCarromPointClockwise(point, geo, turns) {
        let x = point.x;
        let y = point.y;
        const normalizedTurns = ((turns % 4) + 4) % 4;
        for (let index = 0; index < normalizedTurns; index++) {
            const dx = x - geo.center;
            const dy = y - geo.center;
            x = geo.center + dy;
            y = geo.center - dx;
        }
        return { x, y };
    }

    function rotateCarromPointCounterClockwise(point, geo, turns) {
        let x = point.x;
        let y = point.y;
        const normalizedTurns = ((turns % 4) + 4) % 4;
        for (let index = 0; index < normalizedTurns; index++) {
            const dx = x - geo.center;
            const dy = y - geo.center;
            x = geo.center - dy;
            y = geo.center + dx;
        }
        return { x, y };
    }

    function applyCarromViewTransform(ctx, geo, turns) {
        const normalizedTurns = ((turns % 4) + 4) % 4;
        if (!normalizedTurns) return;
        ctx.translate(geo.center, geo.center);
        ctx.rotate((Math.PI / 2) * normalizedTurns);
        ctx.translate(-geo.center, -geo.center);
    }

    function getCurrentCarromStriker(room, useLocalLane) {
        const geo = getCarromGeometry(760);
        const activeSeat = getActiveCarromControlSeat(room);
        const preview = getCarromAimPreview(room);
        const percent = useLocalLane && canLocalPlayCarrom(room)
            ? carromState.localStrikerPercent
            : (preview?.strikerPercent ?? 50);
        const point = getCarromBaselinePoint(activeSeat, percent, geo);
        const strikerTeam = room ? getCarromTeamForSeat(room.format, room?.board?.turnSeat ?? activeSeat) : 'ivory';
        return {
            ...point,
            radius: geo.strikerRadius,
            team: strikerTeam,
            seatIndex: activeSeat
        };
    }

    function getCarromStrikerPercentFromPoint(seatIndex, point, geo) {
        const min = geo.center - geo.laneHalf;
        const max = geo.center + geo.laneHalf;
        let progress = 0.5;
        if (seatIndex === 0) {
            progress = (clamp(point.x, min, max) - min) / (max - min);
        } else if (seatIndex === 1) {
            progress = (clamp(point.y, min, max) - min) / (max - min);
        } else if (seatIndex === 2) {
            progress = (max - clamp(point.x, min, max)) / (max - min);
        } else {
            progress = (max - clamp(point.y, min, max)) / (max - min);
        }
        return clamp(progress * 100, 5, 95);
    }

    function isPointNearCarromControlLane(seatIndex, point, geo) {
        const min = geo.center - geo.laneHalf;
        const max = geo.center + geo.laneHalf;
        const band = geo.strikerRadius * 2.8;
        if (seatIndex === 0) {
            return point.x >= min - band && point.x <= max + band && Math.abs(point.y - (geo.playMax - geo.baselineInset)) <= band;
        }
        if (seatIndex === 1) {
            return point.y >= min - band && point.y <= max + band && Math.abs(point.x - (geo.playMin + geo.baselineInset)) <= band;
        }
        if (seatIndex === 2) {
            return point.x >= min - band && point.x <= max + band && Math.abs(point.y - (geo.playMin + geo.baselineInset)) <= band;
        }
        return point.y >= min - band && point.y <= max + band && Math.abs(point.x - (geo.playMax - geo.baselineInset)) <= band;
    }

    function syncCarromStrikerToPoint(room, point) {
        if (!room) return null;
        const seatIndex = getActiveCarromControlSeat(room);
        const geo = getCarromGeometry(760);
        carromState.localStrikerPercent = getCarromStrikerPercentFromPoint(seatIndex, point, geo);
        return getCurrentCarromStriker(room, true);
    }

    function getCarromAimPointForSeat(seatIndex, striker, point) {
        return { x: point.x, y: point.y };
    }

    function getCarromPowerFromDistance(distance) {
        const normalized = Math.max(0, distance / CARROM_POWER_DISTANCE);
        const boosted = normalized + Math.max(0, normalized - 0.7) * 0.18;
        return clamp(boosted, 0, 1);
    }

    function getCarromPieceRadius(piece, geo) {
        return piece.type === 'striker' ? geo.strikerRadius : geo.coinRadius;
    }

    function getCarromPieceMass(piece) {
        return piece.type === 'striker' ? 1.35 : 1;
    }

    function setCarromNotice(text) {
        const banner = document.getElementById('carromStatusBanner');
        if (banner) banner.textContent = text;
    }

    function setCarromMode(mode) {
        carromState.mode = mode;
        document.getElementById('carromHostPanel')?.classList.toggle('hidden', mode !== 'host');
        document.getElementById('carromJoinPanel')?.classList.toggle('hidden', mode !== 'join');
        document.getElementById('carromHostTab')?.classList.toggle('active', mode === 'host');
        document.getElementById('carromJoinTab')?.classList.toggle('active', mode === 'join');
    }

    function setCarromRoomSize(size) {
        carromState.roomSize = 2;
        document.getElementById('carromFormat2Btn')?.classList.toggle('active', carromState.roomSize === 2);
        document.getElementById('carromFormat4Btn')?.classList.remove('active');
        if (carromState.gameMode === 'individual') {
            setCarromGameMode('team');
        }
        updateCarromModeVisibility();
    }

    function toggleCarromPanels(hasRoom) {
        document.getElementById('carromHeader')?.classList.toggle('hidden', hasRoom);
        document.getElementById('carromIntroPanel')?.classList.toggle('hidden', hasRoom);
        document.getElementById('carromBoardStage')?.classList.toggle('hidden', !hasRoom);
        document.querySelector('.carrom-layout')?.classList.toggle('room-active', hasRoom);
    }

    function clearCarromAimState(resetPower) {
        carromState.aiming = false;
        carromState.aimPointerId = null;
        carromState.aimPoint = null;
        carromState.aimPower = 0;
        carromState.aimStrikerLocked = false;
        if (resetPower !== false) {
            updateCarromPowerBar(0);
        }
    }

    function cancelCarromSimulation(clearVisual) {
        if (carromState.simFrame) {
            cancelAnimationFrame(carromState.simFrame);
            carromState.simFrame = 0;
        }
        if (clearVisual !== false) {
            carromState.simBoard = null;
        }
    }

    function cleanupCarromSubscription() {
        clearCarromShotWatchdog();
        if (typeof carromState.unsubscribe === 'function') {
            carromState.unsubscribe();
        }
        carromState.unsubscribe = null;
    }

    function clearCarromShotWatchdog() {
        if (carromState.shotWatchdogTimer) {
            clearTimeout(carromState.shotWatchdogTimer);
            carromState.shotWatchdogTimer = 0;
        }
    }

    function scheduleCarromShotWatchdog(room) {
        clearCarromShotWatchdog();
        const shot = room?.board?.shot;
        if (!room?.board?.running || !shot?.id) return;
        carromState.shotWatchdogTimer = window.setTimeout(() => {
            carromState.shotWatchdogTimer = 0;
            maybeRecoverStaleCarromShot(carromState.roomData);
        }, 7200);
    }

    function isLocalCarromHost(room) {
        return !!room && room.hostSessionId === carromState.sessionId;
    }

    function maybePromptCarromApproval(room) {
        const pendingRequest = getPendingCarromJoinRequests(room)[0];
        if (!isLocalCarromHost(room) || !pendingRequest) {
            if (!pendingRequest) carromState.approvalPromptKey = '';
            return;
        }

        const requestKey = getCarromJoinRequestKey(pendingRequest);
        if (!requestKey || carromState.approvalPromptOpen || carromState.approvalPromptKey === requestKey) return;

        carromState.approvalPromptKey = requestKey;
        carromState.approvalPromptOpen = true;

        window.setTimeout(async () => {
            const requestPlayerName = pendingRequest.name || 'A player';
            const requestRoomCode = room.code || carromState.roomCode;
            const approved = window.confirm(`${requestPlayerName} requested approval to join room ${requestRoomCode}.\n\nPress OK to approve now.\nPress Cancel to keep the request pending in Approval Queue.`);
            carromState.approvalPromptOpen = false;

            const liveRequest = getPendingCarromJoinRequests(carromState.roomData)[0];
            if (!isLocalCarromHost(carromState.roomData) || !liveRequest || getCarromJoinRequestKey(liveRequest) !== requestKey) {
                return;
            }

            if (approved) {
                await window.approveCarromJoinRequest(liveRequest.id);
            } else {
                setCarromNotice(`${requestPlayerName} is waiting in Approval Queue. Approve or decline anytime from the sidebar.`);
            }
        }, 0);
    }

    function isCarromPaused(room) {
        return !!room?.board?.paused;
    }

    function canLocalPlayCarrom(room) {
        if (!room) return false;
        if (room.format === 4 && getCarromGameMode(room) === 'team' && carromState.seatIndex != null) {
            const turnSeat = room.board?.turnSeat ?? 0;
            const request = getActiveCarromTeamTurnRequest(room);
            const approvedSeat = request?.status === 'approved' ? request.approvedSeat : null;
            return room.status === 'active'
                && !room.board?.running
                && !isCarromPaused(room)
                && (carromState.seatIndex === turnSeat || carromState.seatIndex === approvedSeat);
        }
        return !!room
            && room.status === 'active'
            && !room.board?.running
            && !isCarromPaused(room)
            && canControlCurrentCarromTurn(room);
    }

    function hasApprovedCarromTeamTurn(room) {
        if (!room || room.format !== 4 || getCarromGameMode(room) !== 'team' || carromState.seatIndex == null) {
            return false;
        }
        const turnSeat = room.board?.turnSeat ?? 0;
        if (carromState.seatIndex === turnSeat) return true;
        const request = getActiveCarromTeamTurnRequest(room);
        return request?.status === 'approved' && Number(request.approvedSeat) === carromState.seatIndex;
    }

    function updateCarromPowerBar(power) {
        const normalizedPower = clamp(power, 0, 1);
        const showBoardRail = normalizedPower > 0.001 || (carromState.aimStrikerLocked && canLocalPlayCarrom(carromState.roomData));
        const fill = document.getElementById('carromPowerFill');
        if (fill) fill.style.width = `${Math.round(normalizedPower * 100)}%`;
        const label = document.getElementById('carromPowerPercent');
        if (label) label.textContent = `${Math.round(normalizedPower * 100)}%`;
        const boardFill = document.getElementById('carromBoardPowerFill');
        if (boardFill) boardFill.style.width = `${Math.round(normalizedPower * 100)}%`;
        const boardLabel = document.getElementById('carromBoardPowerPercent');
        if (boardLabel) boardLabel.textContent = `${Math.round(normalizedPower * 100)}%`;
        const boardRail = document.getElementById('carromBoardPowerRail');
        if (boardRail) {
            boardRail.classList.toggle('hidden', !showBoardRail);
            boardRail.classList.toggle('active', showBoardRail);
        }
    }

    function updateCarromPowerLabel(power) {
        const label = document.getElementById('carromAimHint');
        if (!label) return;
        const percent = Math.round(clamp(power, 0, 1) * 100);
        if (carromState.aimStrikerLocked && canLocalPlayCarrom(carromState.roomData)) {
            label.textContent = `Aim locked. Power ${percent}% ready. Below 1% power the shot will cancel and striker will stay movable.`;
        }
    }

    async function syncCarromAimPreview(room, options = {}) {
        if (!room?.code || !canLocalPlayCarrom(room) || carromState.seatIndex == null) return;
        const preview = options.clear ? null : {
            controlSeat: carromState.seatIndex,
            strikerPercent: Math.round(Number(options.strikerPercent ?? carromState.localStrikerPercent ?? 50)),
            locked: !!(options.locked ?? carromState.aimStrikerLocked),
            power: Number((options.power ?? carromState.aimPower ?? 0).toFixed(2)),
            aimPoint: options.aimPoint
                ? {
                    x: Math.round(Number(options.aimPoint.x) / 4) * 4,
                    y: Math.round(Number(options.aimPoint.y) / 4) * 4
                }
                : null,
            updatedAt: Date.now()
        };
        const previewKey = preview
            ? `${preview.controlSeat}:${preview.strikerPercent}:${preview.locked}:${preview.power}:${preview.aimPoint?.x || ''}:${preview.aimPoint?.y || ''}`
            : 'clear';
        if (!options.force && previewKey === carromState.lastAimSyncKey && Date.now() - carromState.lastAimSyncAt < 240) return;
        carromState.lastAimSyncKey = previewKey;
        carromState.lastAimSyncAt = Date.now();
        try {
            await update(getCarromRoomRef(room.code), {
                'board/aimPreview': preview
            });
        } catch (error) { }
    }

    function cancelCarromBrandFlash(resetState) {
        if (carromState.brandFlashFrame) {
            cancelAnimationFrame(carromState.brandFlashFrame);
            carromState.brandFlashFrame = 0;
        }
        if (resetState !== false) {
            carromState.brandFlashStartedAt = 0;
            carromState.brandFlashUntil = 0;
        }
    }

    function scheduleCarromBrandFlashDraw() {
        if (carromState.brandFlashFrame) {
            cancelAnimationFrame(carromState.brandFlashFrame);
        }
        const tick = () => {
            if (!carromState.brandFlashUntil) {
                carromState.brandFlashFrame = 0;
                return;
            }
            drawCarromBoard();
            if (performance.now() >= carromState.brandFlashUntil) {
                cancelCarromBrandFlash();
                drawCarromBoard();
                return;
            }
            carromState.brandFlashFrame = requestAnimationFrame(tick);
        };
        carromState.brandFlashFrame = requestAnimationFrame(tick);
    }

    function startCarromBrandFlash(brandFlash) {
        const label = String(brandFlash?.text || 'SHIVANG').trim() || 'SHIVANG';
        carromState.brandFlashText = label;
        carromState.brandFlashHue = Number.isFinite(Number(brandFlash?.hueSeed))
            ? Number(brandFlash.hueSeed)
            : Math.floor(Math.random() * 360);
        carromState.brandFlashStartedAt = performance.now();
        carromState.brandFlashUntil = carromState.brandFlashStartedAt + 1900;
        scheduleCarromBrandFlashDraw();
    }

    function drawRoundedRect(ctx, x, y, width, height, radius) {
        const cornerRadius = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + cornerRadius, y);
        ctx.arcTo(x + width, y, x + width, y + height, cornerRadius);
        ctx.arcTo(x + width, y + height, x, y + height, cornerRadius);
        ctx.arcTo(x, y + height, x, y, cornerRadius);
        ctx.arcTo(x, y, x + width, y, cornerRadius);
        ctx.closePath();
    }

    function drawCarromBoardSurface(ctx, geo) {
        ctx.clearRect(0, 0, geo.size, geo.size);

        const wood = ctx.createLinearGradient(0, 0, geo.size, geo.size);
        wood.addColorStop(0, '#7c4a2d');
        wood.addColorStop(0.48, '#b26a3a');
        wood.addColorStop(1, '#6f3d25');
        drawRoundedRect(ctx, 20, 20, geo.size - 40, geo.size - 40, 44);
        ctx.fillStyle = wood;
        ctx.fill();

        const edgeGlow = ctx.createRadialGradient(geo.center, geo.center, geo.size * 0.12, geo.center, geo.center, geo.size * 0.58);
        edgeGlow.addColorStop(0, 'rgba(255, 247, 237, 0.18)');
        edgeGlow.addColorStop(1, 'rgba(255, 247, 237, 0)');
        drawRoundedRect(ctx, 32, 32, geo.size - 64, geo.size - 64, 36);
        ctx.fillStyle = edgeGlow;
        ctx.fill();

        drawRoundedRect(ctx, 60, 60, geo.size - 120, geo.size - 120, 30);
        ctx.fillStyle = '#f6e2bd';
        ctx.fill();
        ctx.strokeStyle = 'rgba(94, 58, 32, 0.48)';
        ctx.lineWidth = 6;
        ctx.stroke();

        drawRoundedRect(ctx, geo.playMin, geo.playMin, geo.playSize, geo.playSize, 22);
        const playField = ctx.createLinearGradient(0, geo.playMin, geo.size, geo.playMax);
        playField.addColorStop(0, '#f9ebcf');
        playField.addColorStop(1, '#efd2a7');
        ctx.fillStyle = playField;
        ctx.fill();
        ctx.strokeStyle = 'rgba(120, 74, 34, 0.42)';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(120, 74, 34, 0.28)';
        ctx.lineWidth = 2;
        ctx.strokeRect(geo.playMin + 22, geo.playMin + 22, geo.playSize - 44, geo.playSize - 44);

        ctx.beginPath();
        ctx.arc(geo.center, geo.center, geo.playSize * 0.14, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(153, 27, 27, 0.38)';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(geo.center, geo.center, geo.playSize * 0.05, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(220, 38, 38, 0.2)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(153, 27, 27, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        const lanes = [
            { x1: geo.center - geo.laneHalf, y1: geo.playMax - geo.baselineInset, x2: geo.center + geo.laneHalf, y2: geo.playMax - geo.baselineInset },
            { x1: geo.playMin + geo.baselineInset, y1: geo.center - geo.laneHalf, x2: geo.playMin + geo.baselineInset, y2: geo.center + geo.laneHalf },
            { x1: geo.center - geo.laneHalf, y1: geo.playMin + geo.baselineInset, x2: geo.center + geo.laneHalf, y2: geo.playMin + geo.baselineInset },
            { x1: geo.playMax - geo.baselineInset, y1: geo.center - geo.laneHalf, x2: geo.playMax - geo.baselineInset, y2: geo.center + geo.laneHalf }
        ];
        lanes.forEach(lane => {
            ctx.beginPath();
            ctx.moveTo(lane.x1, lane.y1);
            ctx.lineTo(lane.x2, lane.y2);
            ctx.strokeStyle = 'rgba(153, 27, 27, 0.46)';
            ctx.lineWidth = 3;
            ctx.stroke();
        });

        geo.pocketCenters.forEach(pocket => {
            const pocketGlow = ctx.createRadialGradient(pocket.x, pocket.y, 2, pocket.x, pocket.y, geo.pocketRadius * 1.5);
            pocketGlow.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
            pocketGlow.addColorStop(1, 'rgba(15, 23, 42, 0)');
            ctx.beginPath();
            ctx.arc(pocket.x, pocket.y, geo.pocketRadius * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = pocketGlow;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(pocket.x, pocket.y, geo.pocketRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#111827';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }

    function drawCarromCoin(ctx, piece, geo) {
        const radius = getCarromPieceRadius(piece, geo);
        const teamKey = piece.type === 'striker' ? (piece.team || 'ivory') : piece.type;
        const team = CARROM_TEAMS[teamKey] || CARROM_TEAMS.ivory;
        const fill = ctx.createRadialGradient(piece.x - radius * 0.35, piece.y - radius * 0.45, radius * 0.2, piece.x, piece.y, radius * 1.2);
        const innerTone = piece.type === 'striker'
            ? (teamKey === 'ebony' ? '#475569' : '#ffffff')
            : (piece.type === 'ebony' ? '#475569' : '#ffffff');
        fill.addColorStop(0, innerTone);
        fill.addColorStop(1, team.color);
        ctx.save();
        ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(piece.x, piece.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = piece.type === 'striker' ? 5 : 3;
        ctx.strokeStyle = team.stroke;
        ctx.stroke();
        if (piece.type === 'queen') {
            ctx.beginPath();
            ctx.arc(piece.x, piece.y, radius * 0.48, 0, Math.PI * 2);
            ctx.fillStyle = '#fee2e2';
            ctx.fill();
        } else if (piece.type === 'striker') {
            ctx.beginPath();
            ctx.arc(piece.x, piece.y, radius * 0.42, 0, Math.PI * 2);
            ctx.strokeStyle = teamKey === 'ebony' ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.42)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.restore();
    }

    function getCarromAimRebound(striker, nx, ny, previewLength, geo) {
        const margin = geo.strikerRadius + 8;
        const minX = geo.playMin + margin;
        const maxX = geo.playMax - margin;
        const minY = geo.playMin + margin;
        const maxY = geo.playMax - margin;
        const candidates = [];

        if (nx > 0.0001) candidates.push({ t: (maxX - striker.x) / nx, axis: 'x', hitX: maxX, hitY: striker.y + ny * ((maxX - striker.x) / nx) });
        if (nx < -0.0001) candidates.push({ t: (minX - striker.x) / nx, axis: 'x', hitX: minX, hitY: striker.y + ny * ((minX - striker.x) / nx) });
        if (ny > 0.0001) candidates.push({ t: (maxY - striker.y) / ny, axis: 'y', hitX: striker.x + nx * ((maxY - striker.y) / ny), hitY: maxY });
        if (ny < -0.0001) candidates.push({ t: (minY - striker.y) / ny, axis: 'y', hitX: striker.x + nx * ((minY - striker.y) / ny), hitY: minY });

        const validHit = candidates
            .filter(item => item.t > 0 && item.t < previewLength)
            .filter(item => item.hitX >= minX - 1 && item.hitX <= maxX + 1 && item.hitY >= minY - 1 && item.hitY <= maxY + 1)
            .sort((left, right) => left.t - right.t)[0];

        if (!validHit) return null;

        const reboundNx = validHit.axis === 'x' ? -nx : nx;
        const reboundNy = validHit.axis === 'y' ? -ny : ny;
        const reboundLength = Math.max(40, Math.min(previewLength * 0.7, 170));

        return {
            hitX: validHit.hitX,
            hitY: validHit.hitY,
            endX: validHit.hitX + reboundNx * reboundLength,
            endY: validHit.hitY + reboundNy * reboundLength
        };
    }

    function drawCarromAimArrow(ctx, fromX, fromY, toX, toY, color, size = 14) {
        const angle = Math.atan2(toY - fromY, toX - fromX);
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - Math.cos(angle - Math.PI / 7) * size, toY - Math.sin(angle - Math.PI / 7) * size);
        ctx.lineTo(toX - Math.cos(angle + Math.PI / 7) * size, toY - Math.sin(angle + Math.PI / 7) * size);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function drawCarromAimGuide(ctx, striker, aimPoint, ownAim, geo, power = 0) {
        if (!aimPoint) return;
        const dx = striker.x - aimPoint.x;
        const dy = striker.y - aimPoint.y;
        const distance = Math.hypot(dx, dy) || 1;
        const nx = dx / distance;
        const ny = dy / distance;
        const previewLength = 160 + distance * 0.12;
        ctx.save();
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = ownAim ? 'rgba(249, 115, 22, 0.78)' : 'rgba(59, 130, 246, 0.8)';
        ctx.beginPath();
        ctx.moveTo(aimPoint.x, aimPoint.y);
        ctx.lineTo(striker.x, striker.y);
        const guideEndX = striker.x + nx * previewLength;
        const guideEndY = striker.y + ny * previewLength;
        ctx.lineTo(guideEndX, guideEndY);
        ctx.stroke();
        drawCarromAimArrow(ctx, striker.x, striker.y, guideEndX, guideEndY, ownAim ? 'rgba(249, 115, 22, 0.95)' : 'rgba(59, 130, 246, 0.95)', 15);
        if (geo && power >= 0.72) {
            const rebound = getCarromAimRebound(striker, nx, ny, previewLength, geo);
            if (rebound) {
                ctx.setLineDash([7, 7]);
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = ownAim ? 'rgba(251, 191, 36, 0.95)' : 'rgba(147, 197, 253, 0.92)';
                ctx.beginPath();
                ctx.moveTo(rebound.hitX, rebound.hitY);
                ctx.lineTo(rebound.endX, rebound.endY);
                ctx.stroke();
                drawCarromAimArrow(ctx, rebound.hitX, rebound.hitY, rebound.endX, rebound.endY, ownAim ? 'rgba(251, 191, 36, 0.95)' : 'rgba(147, 197, 253, 0.95)', 13);

                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.arc(rebound.hitX, rebound.hitY, 6, 0, Math.PI * 2);
                ctx.fillStyle = ownAim ? 'rgba(251, 191, 36, 0.92)' : 'rgba(96, 165, 250, 0.9)';
                ctx.fill();
            }
        }
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(aimPoint.x, aimPoint.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = ownAim ? 'rgba(249, 115, 22, 0.2)' : 'rgba(59, 130, 246, 0.2)';
        ctx.fill();
        ctx.restore();
    }

    function drawCarromBrandFlash(ctx, geo) {
        if (!carromState.brandFlashUntil || performance.now() >= carromState.brandFlashUntil) {
            return;
        }

        const total = Math.max(1, carromState.brandFlashUntil - carromState.brandFlashStartedAt);
        const elapsed = performance.now() - carromState.brandFlashStartedAt;
        const progress = clamp(elapsed / total, 0, 1);
        const blink = 0.35 + (Math.abs(Math.sin(progress * Math.PI * 6)) * 0.65);
        const scale = 0.94 + (blink * 0.1);
        const hueA = (carromState.brandFlashHue + progress * 300) % 360;
        const hueB = (hueA + 84) % 360;
        const hueC = (hueA + 168) % 360;
        const boxWidth = geo.playSize * 0.68;
        const boxHeight = geo.playSize * 0.18;
        const boxX = geo.center - (boxWidth / 2);
        const boxY = geo.center - (boxHeight / 2);

        ctx.save();
        drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 28);
        ctx.fillStyle = `hsla(${hueA}, 92%, 10%, ${0.16 + blink * 0.14})`;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = `hsla(${hueB}, 100%, 82%, ${0.26 + blink * 0.4})`;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.round(geo.playSize * 0.105 * scale)}px "Trebuchet MS", "Segoe UI", sans-serif`;
        ctx.shadowColor = `hsla(${hueC}, 100%, 62%, 0.75)`;
        ctx.shadowBlur = 22 + (blink * 24);
        ctx.lineWidth = 10;
        ctx.strokeStyle = `hsla(${hueA}, 100%, 16%, ${0.55 + blink * 0.25})`;
        const glowGradient = ctx.createLinearGradient(boxX, geo.center, boxX + boxWidth, geo.center);
        glowGradient.addColorStop(0, `hsla(${hueA}, 100%, 74%, 0.98)`);
        glowGradient.addColorStop(0.5, `hsla(${hueB}, 100%, 80%, 1)`);
        glowGradient.addColorStop(1, `hsla(${hueC}, 100%, 72%, 0.98)`);
        ctx.strokeText(carromState.brandFlashText, geo.center, geo.center + 2);
        ctx.fillStyle = glowGradient;
        ctx.fillText(carromState.brandFlashText, geo.center, geo.center);
        ctx.restore();
    }

    function drawCarromBoard() {
        ensureCarromCanvasBindings();
        if (!carromState.canvas || !carromState.ctx) return;

        const ctx = carromState.ctx;
        const geo = getCarromGeometry(carromState.canvas.width);
        const room = carromState.roomData;
        const board = room?.board || buildInitialCarromBoard(carromState.roomSize);
        const pieces = carromState.simBoard?.pieces || cloneCarromPieces(board.pieces || []);
        const striker = carromState.simBoard?.striker
            || (room ? getCurrentCarromStriker(room, true) : null);
        const viewTurns = getCarromViewTurns();

        ctx.save();
        applyCarromViewTransform(ctx, geo, viewTurns);
        drawCarromBoardSurface(ctx, geo);

        pieces
            .filter(piece => !piece.pocketed)
            .forEach(piece => drawCarromCoin(ctx, piece, geo));

        if (striker && !striker.pocketed) {
            drawCarromCoin(ctx, { ...striker, type: 'striker' }, geo);
        }

        const preview = getCarromAimPreview(room);
        const localAimActive = room && canLocalPlayCarrom(room) && carromState.aimStrikerLocked && carromState.aimPoint;
        const remotePreview = preview && preview.locked && (!localAimActive || preview.controlSeat !== carromState.seatIndex) ? preview : null;
        if (striker && localAimActive) {
            drawCarromAimGuide(ctx, striker, carromState.aimPoint, true, geo, carromState.aimPower || 0);
        } else if (striker && remotePreview?.aimPoint) {
            drawCarromAimGuide(ctx, striker, remotePreview.aimPoint, false, geo, remotePreview.power || 0);
        }

        ctx.restore();

        ctx.save();
        ctx.font = '700 18px Roboto, sans-serif';
        ctx.fillStyle = 'rgba(120, 74, 34, 0.72)';
        ctx.textAlign = 'center';
        ctx.fillText('CARROM CROWN', geo.center, 58);
        ctx.restore();

        drawCarromBrandFlash(ctx, geo);

        if (room && isCarromPaused(room)) {
            ctx.save();
            drawRoundedRect(ctx, geo.playMin + 26, geo.playMin + 26, geo.playSize - 52, geo.playSize - 52, 26);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.44)';
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fde68a';
            ctx.font = '800 44px Roboto, sans-serif';
            ctx.fillText('PAUSED', geo.center, geo.center - 10);
            ctx.font = '600 20px Roboto, sans-serif';
            ctx.fillStyle = '#ffedd5';
            ctx.fillText(room.board?.pausedBy ? `Paused by ${room.board.pausedBy}` : 'Waiting to resume', geo.center, geo.center + 28);
            ctx.restore();
        }
    }

    function getCanvasPointFromEvent(event) {
        if (!carromState.canvas) return { x: 0, y: 0 };
        const rect = carromState.canvas.getBoundingClientRect();
        const scaleX = carromState.canvas.width / rect.width;
        const scaleY = carromState.canvas.height / rect.height;
        const geo = getCarromGeometry(carromState.canvas.width);
        const rawPoint = {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
        return rotateCarromPointCounterClockwise(rawPoint, geo, getCarromViewTurns());
    }

    async function launchCarromShot(striker, aimPoint) {
        const room = carromState.roomData;
        if (!canLocalPlayCarrom(room) || !room || carromState.seatIndex == null) {
            clearCarromAimState();
            drawCarromBoard();
            return;
        }
        if (room.format === 4 && getCarromGameMode(room) === 'team' && !hasApprovedCarromTeamTurn(room)) {
            clearCarromAimState();
            setCarromNotice('Apne teammate ki approval ke bina team shot start nahi ho sakta.');
            drawCarromBoard();
            return;
        }

        const vectorX = striker.x - aimPoint.x;
        const vectorY = striker.y - aimPoint.y;
        const distance = Math.hypot(vectorX, vectorY);
        const rawPower = getCarromPowerFromDistance(distance);
        const committedPower = Math.max(rawPower, carromState.aimPower || 0);
        if (committedPower < 0.003) {
            carromState.aimStrikerLocked = false;
            carromState.aimPoint = null;
            carromState.aimPower = 0;
            updateCarromPowerBar(0);
            syncCarromAimPreview(room, {
                strikerPercent: carromState.localStrikerPercent,
                locked: false,
                aimPoint: null,
                power: 0,
                force: true
            });
            setCarromNotice('Shot canceled because power was too low. You can move the striker again.');
            drawCarromBoard();
            return;
        }

        const power = clamp(committedPower, 0.003, 1);
        const speed = 6.5 + power * 13.5;
        const shot = {
            id: `shot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            seatIndex: carromState.seatIndex,
            turnSeat: room.board?.turnSeat ?? carromState.seatIndex,
            playerName: room.players?.[carromState.seatIndex]?.name || 'Player',
            strikerX: striker.x,
            strikerY: striker.y,
            vx: (vectorX / distance) * speed,
            vy: (vectorY / distance) * speed,
            power: Number(power.toFixed(3)),
            launchedAt: Date.now()
        };

        clearCarromAimState();
        setCarromNotice(`${shot.playerName} tees up the striker at ${Math.round(power * 100)}% power...`);

        try {
            await update(getCarromRoomRef(room.code), {
                board: {
                    ...room.board,
                    running: true,
                    aimPreview: null,
                    teamTurnRequest: null,
                    shot,
                    resultText: `${shot.playerName} lines up a shot from the ${getSeatInfo(shot.seatIndex).short} side at ${Math.round(power * 100)}% power.`
                },
                resultText: `${shot.playerName} lines up a shot from the ${getSeatInfo(shot.seatIndex).short} side.`,
                updatedAt: Date.now()
            });
            const liveRoom = normalizeCarromRoomData({
                ...room,
                board: {
                    ...room.board,
                    running: true,
                    shot
                }
            });
            startCarromShotSimulation(liveRoom, shot);
        } catch (error) {
            setCarromNotice(`Shot could not start. Firebase error: ${error?.message || 'Unknown error'}`);
            drawCarromBoard();
        }
    }

    function ensureCarromCanvasBindings() {
        if (carromState.canvasBound) return;
        const canvas = document.getElementById('carromBoardCanvas');
        if (!canvas) return;
        carromState.canvas = canvas;
        carromState.ctx = canvas.getContext('2d');

        canvas.addEventListener('wheel', event => {
            event.preventDefault();
        }, { passive: false });

        canvas.addEventListener('contextmenu', event => {
            event.preventDefault();
        });

        canvas.addEventListener('pointermove', event => {
            const room = carromState.roomData;
            if (!canLocalPlayCarrom(room)) return;
            const geo = getCarromGeometry(canvas.width);
            const point = getCanvasPointFromEvent(event);
            const controlSeat = getActiveCarromControlSeat(room);
            let striker = getCurrentCarromStriker(room, true);

            if (!carromState.aimStrikerLocked) {
                if (!isPointNearCarromControlLane(controlSeat, point, geo)) return;
                striker = syncCarromStrikerToPoint(room, point) || striker;
                carromState.aimPoint = null;
                carromState.aimPower = 0;
                updateCarromPowerBar(0);
                syncCarromAimPreview(room, {
                    strikerPercent: carromState.localStrikerPercent,
                    locked: false,
                    aimPoint: null,
                    power: 0
                });
                drawCarromBoard();
                return;
            }

            carromState.aimPoint = getCarromAimPointForSeat(controlSeat, striker, point);
            carromState.aimPower = getCarromPowerFromDistance(Math.hypot(striker.x - carromState.aimPoint.x, striker.y - carromState.aimPoint.y));
            updateCarromPowerBar(carromState.aimPower);
            updateCarromPowerLabel(carromState.aimPower);
            syncCarromAimPreview(room, {
                strikerPercent: carromState.localStrikerPercent,
                locked: true,
                aimPoint: carromState.aimPoint,
                power: carromState.aimPower
            });
            drawCarromBoard();
        });

        canvas.addEventListener('pointerdown', async event => {
            const room = carromState.roomData;
            if (!canLocalPlayCarrom(room)) return;
            const now = Date.now();

            if (event.button === 2) {
                event.preventDefault();
                if (now - carromState.rightClickArmedAt < 320) {
                    carromState.aimStrikerLocked = !carromState.aimStrikerLocked;
                    if (!carromState.aimStrikerLocked) {
                        carromState.aimPoint = null;
                        carromState.aimPower = 0;
                        updateCarromPowerBar(0);
                    }
                    syncCarromAimPreview(room, {
                        strikerPercent: carromState.localStrikerPercent,
                        locked: carromState.aimStrikerLocked,
                        aimPoint: carromState.aimStrikerLocked ? carromState.aimPoint : null,
                        power: carromState.aimStrikerLocked ? carromState.aimPower : 0,
                        force: true
                    });
                    drawCarromBoard();
                    carromState.rightClickArmedAt = 0;
                    return;
                }
                carromState.rightClickArmedAt = now;
                return;
            }

            if (event.button !== 0) return;
            if (!carromState.aimStrikerLocked || !carromState.aimPoint) {
                drawCarromBoard();
                return;
            }
            const striker = getCurrentCarromStriker(room, true);
            await launchCarromShot(striker, carromState.aimPoint);
        });

        carromState.canvasBound = true;
        drawCarromBoard();
    }

    function advanceCarromSimulation(simulation) {
        const geo = getCarromGeometry(760);
        const pieces = simulation.pieces;
        const friction = 0.992;
        const wallMin = geo.playMin;
        const wallMax = geo.playMax;

        for (let index = 0; index < pieces.length; index++) {
            const piece = pieces[index];
            if (piece.pocketed) continue;
            piece.x += piece.vx;
            piece.y += piece.vy;
            piece.vx *= friction;
            piece.vy *= friction;

            if (Math.abs(piece.vx) < 0.02) piece.vx = 0;
            if (Math.abs(piece.vy) < 0.02) piece.vy = 0;

            const radius = getCarromPieceRadius(piece, geo);
            const pocketed = geo.pocketCenters.some(pocket => Math.hypot(piece.x - pocket.x, piece.y - pocket.y) <= geo.pocketRadius - radius * 0.1);
            if (pocketed) {
                piece.pocketed = true;
                piece.vx = 0;
                piece.vy = 0;
                if (piece.type === 'striker') {
                    simulation.strikerPocketed = true;
                } else {
                    simulation.pocketed.push({ id: piece.id, type: piece.type });
                }
                continue;
            }

            if (piece.x - radius < wallMin) {
                piece.x = wallMin + radius;
                piece.vx = Math.abs(piece.vx) * 0.98;
            } else if (piece.x + radius > wallMax) {
                piece.x = wallMax - radius;
                piece.vx = -Math.abs(piece.vx) * 0.98;
            }

            if (piece.y - radius < wallMin) {
                piece.y = wallMin + radius;
                piece.vy = Math.abs(piece.vy) * 0.98;
            } else if (piece.y + radius > wallMax) {
                piece.y = wallMax - radius;
                piece.vy = -Math.abs(piece.vy) * 0.98;
            }
        }

        for (let leftIndex = 0; leftIndex < pieces.length; leftIndex++) {
            const leftPiece = pieces[leftIndex];
            if (leftPiece.pocketed) continue;
            for (let rightIndex = leftIndex + 1; rightIndex < pieces.length; rightIndex++) {
                const rightPiece = pieces[rightIndex];
                if (rightPiece.pocketed) continue;

                const dx = rightPiece.x - leftPiece.x;
                const dy = rightPiece.y - leftPiece.y;
                const distance = Math.hypot(dx, dy) || 0.0001;
                const minDistance = getCarromPieceRadius(leftPiece, geo) + getCarromPieceRadius(rightPiece, geo);
                if (distance >= minDistance) continue;

                const nx = dx / distance;
                const ny = dy / distance;
                const overlap = minDistance - distance;
                leftPiece.x -= nx * overlap * 0.5;
                leftPiece.y -= ny * overlap * 0.5;
                rightPiece.x += nx * overlap * 0.5;
                rightPiece.y += ny * overlap * 0.5;

                const relativeVX = rightPiece.vx - leftPiece.vx;
                const relativeVY = rightPiece.vy - leftPiece.vy;
                const velocityAlongNormal = relativeVX * nx + relativeVY * ny;
                if (velocityAlongNormal > 0) continue;

                const restitution = 0.985;
                const impulse = -(1 + restitution) * velocityAlongNormal / ((1 / getCarromPieceMass(leftPiece)) + (1 / getCarromPieceMass(rightPiece)));
                const impulseX = impulse * nx;
                const impulseY = impulse * ny;

                leftPiece.vx -= impulseX / getCarromPieceMass(leftPiece);
                leftPiece.vy -= impulseY / getCarromPieceMass(leftPiece);
                rightPiece.vx += impulseX / getCarromPieceMass(rightPiece);
                rightPiece.vy += impulseY / getCarromPieceMass(rightPiece);
            }
        }

        const moving = pieces.some(piece => !piece.pocketed && (Math.abs(piece.vx) > 0.04 || Math.abs(piece.vy) > 0.04));
        simulation.restFrames = moving ? 0 : simulation.restFrames + 1;
        return simulation.restFrames > 8;
    }

    function buildCarromSimulation(room, shot) {
        const pieces = cloneCarromPieces(room.board.pieces)
            .filter(piece => !piece.pocketed)
            .map(piece => ({ ...piece, vx: 0, vy: 0 }));
        const strikerTeam = getCarromTeamForSeat(room.format, shot.turnSeat ?? shot.seatIndex);
        const striker = {
            id: 'striker',
            type: 'striker',
            team: strikerTeam,
            x: shot.strikerX,
            y: shot.strikerY,
            vx: shot.vx,
            vy: shot.vy,
            pocketed: false
        };
        return {
            shotId: shot.id,
            pieces: [...pieces, striker],
            striker,
            pocketed: [],
            strikerPocketed: false,
            restFrames: 0
        };
    }

    function simulateCarromShotToEnd(room, shot) {
        const simulation = buildCarromSimulation(room, shot);
        let guard = 0;
        while (guard < 2400) {
            let finished = false;
            for (let index = 0; index < 2; index++) {
                finished = advanceCarromSimulation(simulation);
                if (finished) break;
            }
            if (finished) break;
            guard++;
        }
        return simulation;
    }

    function getCarromPointValue(pieceType) {
        if (pieceType === 'ivory') return 20;
        if (pieceType === 'ebony') return 10;
        if (pieceType === 'queen') return 50;
        return 0;
    }

    function restoreCarromQueenToCenter(pieces) {
        const geo = getCarromGeometry(760);
        const hasQueen = (pieces || []).some(piece => piece.id === 'queen');
        const nextPieces = hasQueen ? (pieces || []).map(piece => piece.id === 'queen'
            ? { ...piece, pocketed: false, x: geo.center, y: geo.center }
            : piece) : [...(pieces || []), {
                id: 'queen',
                type: 'queen',
                x: geo.center,
                y: geo.center,
                pocketed: false
            }];
        return nextPieces;
    }

    function restorePenaltyCoinToBoard(pieces, pieceType) {
        if (!pieceType) return { pieces: pieces || [], restored: null };
        const geo = getCarromGeometry(760);
        const penaltySpots = [
            { x: geo.center - geo.coinRadius * 2.6, y: geo.center },
            { x: geo.center + geo.coinRadius * 2.6, y: geo.center },
            { x: geo.center, y: geo.center - geo.coinRadius * 2.6 },
            { x: geo.center, y: geo.center + geo.coinRadius * 2.6 }
        ];
        let restored = null;
        const nextPieces = (pieces || []).map(piece => {
            if (restored || piece.type !== pieceType || !piece.pocketed) return piece;
            const spot = penaltySpots[0];
            restored = {
                ...piece,
                pocketed: false,
                x: Number(spot.x.toFixed(2)),
                y: Number(spot.y.toFixed(2))
            };
            return restored;
        });
        return { pieces: nextPieces, restored };
    }

    function restoreCarromStrikerPenaltyCoin(pieces) {
        const blackFirst = restorePenaltyCoinToBoard(pieces, 'ebony');
        if (blackFirst.restored) return blackFirst;
        return restorePenaltyCoinToBoard(blackFirst.pieces, 'ivory');
    }

    function getCarromIndividualWinners(playerScores) {
        const entries = Object.entries(playerScores || {}).map(([seat, score]) => ({
            seatIndex: Number(seat),
            score: Number(score) || 0
        }));
        const bestScore = entries.reduce((max, entry) => Math.max(max, entry.score), 0);
        return entries.filter(entry => entry.score === bestScore).map(entry => entry.seatIndex);
    }

    function summarizeCarromShot(room, shot, simulation, resolvedBoard) {
        const shooter = shot.playerName || room.players?.[shot.seatIndex]?.name || 'Player';
        const seat = getSeatInfo(shot.seatIndex).short;
        const currentTeam = getCarromTeamForSeat(room.format, shot.turnSeat ?? shot.seatIndex);
        const opponentTeam = getOpponentTeam(currentTeam);
        const ownPocketed = simulation.pocketed.filter(item => item.type === currentTeam).length;
        const opponentPocketed = simulation.pocketed.filter(item => item.type === opponentTeam).length;
        const queenPocketed = simulation.pocketed.filter(item => item.type === 'queen').length;
        const queenPendingShot = room.board?.queenPendingOwnerSeat != null && Number(room.board.queenPendingOwnerSeat) === shot.seatIndex;
        const parts = [`${shooter} (${seat})`];

        if (!ownPocketed && !opponentPocketed && !queenPocketed && !simulation.strikerPocketed) {
            parts.push('found no pocket');
        } else {
            if (isCarromPlayerPointsMode(getCarromGameMode(room))) {
                if (simulation.pocketed.length) parts.push(`scored ${simulation.pocketed.map(item => item.type).join(', ')}`);
            } else {
                if (ownPocketed) parts.push(`banked ${ownPocketed} own coin${ownPocketed === 1 ? '' : 's'}`);
                if (opponentPocketed) parts.push(`fed ${opponentPocketed} coin${opponentPocketed === 1 ? '' : 's'} to ${getTeamLabel(opponentTeam)}`);
            }
            if (queenPocketed) {
                parts.push(simulation.queenCounted ? 'queen counted' : 'queen awaiting cover');
            } else if (queenPendingShot) {
                parts.push(simulation.queenCounted ? 'queen covered' : 'queen returned');
            }
            if (simulation.strikerPocketed) parts.push('took a striker foul');
        }

        if (resolvedBoard.winnerLabel) {
            parts.push(resolvedBoard.winnerLabel);
        } else if (resolvedBoard.turnSeat === shot.seatIndex) {
            parts.push('keeps the board');
        } else {
            parts.push(`next shot: ${getSeatInfo(resolvedBoard.turnSeat).short}`);
        }
        return parts.join(' • ');
    }

    function canResolveLocalCarromShot(room, shot, allowAnySeatedPlayer = false) {
        if (!room || !shot) return false;
        if (isLocalCarromHost(room)) return true;
        if (allowAnySeatedPlayer) {
            return getCarromSeatBySession(room, carromState.sessionId) != null;
        }
        const shooterSessionId = room.players?.[shot.seatIndex]?.sessionId || '';
        return !!shooterSessionId && shooterSessionId === carromState.sessionId;
    }

    function maybeRecoverStaleCarromShot(room) {
        const shot = room?.board?.shot;
        if (!room?.board?.running || !shot?.id || !shot?.launchedAt) return false;
        const shotAge = Date.now() - Number(shot.launchedAt || 0);
        if (shotAge < 6500) return false;
        if (!canResolveLocalCarromShot(room, shot, true)) return false;
        const recoveredSimulation = simulateCarromShotToEnd(room, shot);
        resolveCarromShotIfHost(room, shot, recoveredSimulation, true);
        return true;
    }

    async function resolveCarromShotIfHost(room, shot, simulation, allowAnySeatedPlayer = false) {
        if (!canResolveLocalCarromShot(room, shot, allowAnySeatedPlayer) || carromState.hostResolvingShotId === shot.id) return;
        carromState.hostResolvingShotId = shot.id;
        const gameMode = getCarromGameMode(room);
        const turnSeat = shot.turnSeat ?? shot.seatIndex;
        const currentTeam = getCarromTeamForSeat(room.format, turnSeat);
        const opponentTeam = getOpponentTeam(currentTeam);
        const baseScores = { ivory: room.board.scores?.ivory || 0, ebony: room.board.scores?.ebony || 0 };
        const basePlayerScores = { 0: 0, 1: 0, 2: 0, 3: 0, ...(room.board.playerScores || {}) };
        const ownPocketed = simulation.pocketed.filter(item => item.type === currentTeam).length;
        const opponentPocketed = simulation.pocketed.filter(item => item.type === opponentTeam).length;
        const queenPocketed = simulation.pocketed.filter(item => item.type === 'queen').length;
        const normalPocketed = simulation.pocketed.filter(item => item.type === 'ivory' || item.type === 'ebony').length;
        const resolvedAt = Date.now();
        const scoredCoins = ownPocketed + opponentPocketed + queenPocketed;
        const rawResolvedPieces = simulation.pieces
            .filter(piece => piece.type !== 'striker')
            .map(piece => ({
                id: piece.id,
                type: piece.type,
                x: Number(piece.x.toFixed(2)),
                y: Number(piece.y.toFixed(2)),
                pocketed: !!piece.pocketed
            }));
        const normalRemainingAfterShot = rawResolvedPieces.filter(piece => !piece.pocketed && piece.type !== 'queen').length;
        const hadPendingQueen = room.board?.queenPendingOwnerSeat != null;
        const pendingQueenOwnerSeat = hadPendingQueen ? Number(room.board.queenPendingOwnerSeat) : null;
        const pendingQueenTeam = room.board?.queenPendingTeam || (pendingQueenOwnerSeat != null ? getCarromTeamForSeat(room.format, pendingQueenOwnerSeat) : '');
        const isPendingQueenCoverShot = pendingQueenOwnerSeat != null && pendingQueenOwnerSeat === shot.seatIndex;
        const coinPointsMode = gameMode === 'coinpoints';
        const playerPointsMode = isCarromPlayerPointsMode(gameMode);
        const coverCoinPocketed = coinPointsMode ? normalPocketed > 0 : ownPocketed > 0;
        const queenImmediateCounted = coinPointsMode
            ? queenPocketed > 0 && !simulation.strikerPocketed
            : queenPocketed > 0 && normalRemainingAfterShot === 0 && !simulation.strikerPocketed;
        const queenCoverSucceeded = isPendingQueenCoverShot && !simulation.strikerPocketed && (coverCoinPocketed || normalRemainingAfterShot === 0);
        const queenCounted = queenImmediateCounted || queenCoverSucceeded;
        const queenNeedsCover = !coinPointsMode && queenPocketed > 0 && !queenImmediateCounted && !simulation.strikerPocketed;
        const queenCoverFailed = !coinPointsMode && isPendingQueenCoverShot && !queenCoverSucceeded;
        const keepTurn = queenNeedsCover || (!simulation.strikerPocketed && (
            playerPointsMode
                ? simulation.pocketed.some(item => item.type !== 'queen') || queenCounted
                : (ownPocketed > 0 || queenCounted)
        ));

        const nextScores = {
            ivory: baseScores.ivory,
            ebony: baseScores.ebony
        };
        const nextPlayerScores = {
            0: Number(basePlayerScores[0]) || 0,
            1: Number(basePlayerScores[1]) || 0,
            2: Number(basePlayerScores[2]) || 0,
            3: Number(basePlayerScores[3]) || 0
        };

        if (playerPointsMode) {
            simulation.pocketed.forEach(item => {
                if (item.type === 'queen' && !queenCounted) return;
                nextPlayerScores[shot.seatIndex] = Math.max(0, (Number(nextPlayerScores[shot.seatIndex]) || 0) + getCarromPointValue(item.type));
            });
            if (queenCoverSucceeded) {
                nextPlayerScores[shot.seatIndex] = Math.max(0, (Number(nextPlayerScores[shot.seatIndex]) || 0) + getCarromPointValue('queen'));
            }
        } else {
            nextScores[currentTeam] = Math.max(0, nextScores[currentTeam] + ownPocketed + (queenCounted ? 1 : 0) - (simulation.strikerPocketed ? 1 : 0));
            nextScores[opponentTeam] = Math.max(0, nextScores[opponentTeam] + opponentPocketed);
        }
        if (simulation.strikerPocketed && playerPointsMode) {
            nextPlayerScores[shot.seatIndex] = Math.max(0, (Number(nextPlayerScores[shot.seatIndex]) || 0) - (coinPointsMode ? 10 : 1));
        }

        let resolvedPieces = rawResolvedPieces;
        if (queenCoverFailed || (queenPocketed && simulation.strikerPocketed)) {
            resolvedPieces = restoreCarromQueenToCenter(resolvedPieces);
        }
        let restoredPenaltyCoin = null;
        if (simulation.strikerPocketed) {
            const penaltyRestore = coinPointsMode
                ? restoreCarromStrikerPenaltyCoin(resolvedPieces)
                : restorePenaltyCoinToBoard(resolvedPieces, currentTeam);
            resolvedPieces = penaltyRestore.pieces;
            restoredPenaltyCoin = penaltyRestore.restored;
            if (restoredPenaltyCoin) {
                if (playerPointsMode) {
                    if (!coinPointsMode) {
                        nextPlayerScores[shot.seatIndex] = Math.max(0, (Number(nextPlayerScores[shot.seatIndex]) || 0) - getCarromPointValue(restoredPenaltyCoin.type));
                    }
                } else {
                    nextScores[currentTeam] = Math.max(0, nextScores[currentTeam] - 1);
                }
            }
        }

        const remainingCoins = resolvedPieces.filter(piece => !piece.pocketed && piece.type !== 'queen');
        const nextQueenCovered = queenCounted || room.board?.queenCovered;
        const nextQueenPendingOwnerSeat = queenNeedsCover ? shot.seatIndex : null;
        const nextQueenPendingTeam = queenNeedsCover ? currentTeam : '';
        const teamFinished = nextQueenCovered && !playerPointsMode && remainingCoins.every(piece => piece.type !== currentTeam);
        const allFinished = (coinPointsMode || nextQueenCovered) && resolvedPieces.every(piece => piece.pocketed);
        const winnerTeam = playerPointsMode
            ? ''
            : (teamFinished
                ? currentTeam
                : (allFinished ? (nextScores.ivory === nextScores.ebony ? 'draw' : (nextScores.ivory > nextScores.ebony ? 'ivory' : 'ebony')) : ''));
        const winnerSeats = playerPointsMode && allFinished
            ? getCarromIndividualWinners(nextPlayerScores)
            : (winnerTeam && winnerTeam !== 'draw'
                ? getAllowedCarromSeats(room.format).filter(seatIndex => getCarromTeamForSeat(room.format, seatIndex) === winnerTeam)
                : []);
        const winnerLabel = playerPointsMode
            ? (winnerSeats.length
                ? `${winnerSeats.map(seatIndex => room.players?.[seatIndex]?.name || getSeatInfo(seatIndex).short).join(' + ')} wins`
                : (allFinished ? 'Highest points wins' : ''))
            : winnerTeam === 'draw'
                ? 'Board drawn'
                : winnerTeam
                    ? `${getTeamLabel(winnerTeam)} wins`
                    : '';
        const nextTurnSeat = nextQueenPendingOwnerSeat != null
            ? nextQueenPendingOwnerSeat
            : winnerTeam
                ? turnSeat
                : (winnerSeats.length ? turnSeat : (keepTurn ? turnSeat : getNextCarromTurnSeat(room, turnSeat)));
        let resultText = `${shot.playerName || 'Player'} finishes the shot. ${keepTurn ? `${getSeatInfo(turnSeat).short} keeps the board.` : `${getSeatInfo(nextTurnSeat).short} steps up next.`}`;
        if (winnerLabel) {
            resultText = playerPointsMode
                ? `${winnerLabel}. Final points ${Object.entries(nextPlayerScores).filter(([, score]) => Number(score) > 0).map(([seat, score]) => `${room.players?.[seat]?.name || getSeatInfo(Number(seat)).short}: ${score}`).join(', ')}.`
                : `${winnerLabel}. Final score ${nextScores.ivory}-${nextScores.ebony}.`;
        } else if (queenNeedsCover) {
            resultText = `${shot.playerName || 'Player'} pocketed the queen. ${getSeatInfo(shot.seatIndex).short} gets one cover chance now.`;
        } else if (queenCoverSucceeded) {
            resultText = `${shot.playerName || 'Player'} covered the queen successfully and keeps the game alive.`;
        } else if (queenCoverFailed) {
            resultText = `${shot.playerName || 'Player'} could not cover the queen, so it returns to the center.`;
        } else if (restoredPenaltyCoin) {
            resultText = `${shot.playerName || 'Player'} pocketed the striker, so one ${restoredPenaltyCoin.type} coin returns to the board as penalty.`;
        }
        const resolvedBoard = {
            ...room.board,
            pieces: resolvedPieces,
            scores: nextScores,
            playerScores: nextPlayerScores,
            turnSeat: nextTurnSeat,
            turnNumber: (room.board.turnNumber || 1) + 1,
            running: false,
            shot: null,
            aimPreview: null,
            teamTurnRequest: null,
            resultText,
            winnerTeam,
            winnerSeats,
            queenCovered: nextQueenCovered,
            queenOwnerSeat: queenCounted ? (queenCoverSucceeded ? pendingQueenOwnerSeat : shot.seatIndex) : room.board?.queenOwnerSeat ?? null,
            queenPendingOwnerSeat: nextQueenPendingOwnerSeat,
            queenPendingTeam: nextQueenPendingTeam,
            queenReturned: queenCoverFailed || (queenPocketed > 0 && simulation.strikerPocketed),
            winnerLabel
        };
        const nextStatus = winnerTeam || winnerSeats.length ? 'finished' : 'active';
        const moveLog = [...(room.moveLog || []), summarizeCarromShot(room, shot, simulation, resolvedBoard)].slice(-10);
        const brandFlash = scoredCoins > 0
            ? {
                id: `${shot.id || 'carrom-shot'}:${resolvedAt}`,
                text: shot.playerName || room.players?.[shot.seatIndex]?.name || 'Player',
                hueSeed: Math.floor(Math.random() * 360),
                createdAt: resolvedAt
            }
            : (room.brandFlash || null);

        try {
            await update(getCarromRoomRef(room.code), {
                status: nextStatus,
                board: resolvedBoard,
                moveLog,
                brandFlash,
                resultText,
                updatedAt: resolvedAt
            });
        } catch (error) {
            setCarromNotice(`Shot result sync failed. Firebase error: ${error?.message || 'Unknown error'}`);
        } finally {
            carromState.hostResolvingShotId = '';
        }
    }

    function startCarromShotSimulation(room, shot) {
        if (!room || !shot) return;
        if (carromState.simBoard?.shotId === shot.id) return;
        cancelCarromSimulation();
        clearCarromAimState();
        carromState.lastVisualShotId = shot.id;
        const simulation = buildCarromSimulation(room, shot);
        carromState.simBoard = simulation;

        const step = () => {
            if (!carromState.simBoard || carromState.simBoard.shotId !== shot.id) return;
            let finished = false;
            for (let index = 0; index < 2; index++) {
                finished = advanceCarromSimulation(simulation);
                if (finished) break;
            }
            drawCarromBoard();
            if (finished) {
                carromState.simFrame = 0;
                resolveCarromShotIfHost(room, shot, simulation);
                return;
            }
            carromState.simFrame = requestAnimationFrame(step);
        };

        step();
    }

    function renderCarromSeatCards(room) {
        const gameMode = getCarromGameMode(room);
        for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
            const seatCard = document.getElementById(`carromSeat${seatIndex}Card`);
            const seatName = document.getElementById(`carromSeat${seatIndex}Name`);
            const seatMeta = document.getElementById(`carromSeat${seatIndex}Meta`);
            if (!seatCard || !seatName || !seatMeta) continue;

            const seat = getSeatInfo(seatIndex);
            const seatUsed = !room || getAllowedCarromSeats(room.format).includes(seatIndex);
            const player = room?.players?.[seatIndex];
            const team = room ? getCarromTeamForSeat(room.format, seatIndex) : getCarromTeamForSeat(carromState.roomSize, seatIndex);
            const isCurrentSeat = room?.status === 'active' && room.board?.turnSeat === seatIndex;
            const isLocalSeat = carromState.seatIndex === seatIndex;

            seatCard.classList.toggle('hidden-seat', !seatUsed);
            seatCard.classList.toggle('active-seat', isCurrentSeat || isLocalSeat);

            if (!seatUsed) {
                seatName.textContent = 'Not used in duel';
                seatMeta.textContent = 'Reserved for 4-player table';
                continue;
            }

            if (!player) {
                seatName.textContent = seatIndex === 0 ? 'Waiting for host' : 'Open seat';
                seatMeta.textContent = `${gameMode === 'coinpoints' ? 'Coin Points' : gameMode === 'individual' ? 'Individual' : getTeamLabel(team)} • ${seat.meta}`;
                continue;
            }

            seatName.textContent = player.name;
            const roleBits = [
                isCarromPlayerPointsMode(gameMode) ? seat.label : getTeamLabel(team),
                player.sessionId === room.hostSessionId ? 'Host' : 'Player'
            ];
            if (isLocalSeat) roleBits.push('You');
            seatMeta.textContent = roleBits.join(' • ');
        }
    }

    function renderCarromScoreboard(room) {
        const container = document.getElementById('carromScoreboard');
        if (!container) return;
        if (!room) {
            container.innerHTML = '';
            return;
        }

        const gameMode = getCarromGameMode(room);
        const activeTeam = room.status === 'active' ? getCarromTeamForSeat(room.format, room.board.turnSeat) : '';
        const pieces = room.board?.pieces || [];
        const markup = isCarromPlayerPointsMode(gameMode)
            ? getAllowedCarromSeats(room.format).map(seatIndex => {
                const player = room.players?.[seatIndex];
                const active = room.status === 'active' && room.board.turnSeat === seatIndex;
                const score = room.board?.playerScores?.[seatIndex] || 0;
                return `
                    <div class="carrom-score-card ${active ? 'active' : ''}">
                        <div class="carrom-score-copy">
                            <div class="carrom-score-name">${player?.name || getSeatInfo(seatIndex).label}</div>
                            <div class="carrom-score-note">${player ? 'Individual points race' : 'Waiting for player'}</div>
                        </div>
                        <div class="carrom-score-value">${score}</div>
                    </div>
                `;
            }).join('')
            : ['ivory', 'ebony'].map(team => {
                const seats = getAllowedCarromSeats(room.format).filter(seatIndex => getCarromTeamForSeat(room.format, seatIndex) === team);
                const names = seats.map(seatIndex => room.players?.[seatIndex]?.name).filter(Boolean);
                const remaining = pieces.filter(piece => !piece.pocketed && piece.type === team).length;
                return `
                    <div class="carrom-score-card ${activeTeam === team ? 'active' : ''}">
                        <div class="carrom-score-copy">
                            <div class="carrom-score-name">${getTeamLabel(team)}</div>
                            <div class="carrom-score-note">${names.length ? names.join(' + ') : 'Waiting for players'} • ${remaining} coin${remaining === 1 ? '' : 's'} left</div>
                        </div>
                        <div class="carrom-score-value">${room.board?.scores?.[team] || 0}</div>
                    </div>
                `;
            }).join('');
        container.innerHTML = markup;
    }

    function clearCarromCoinsToast() {
        const toast = document.getElementById('carromBoardCoinsToast');
        if (toast) {
            toast.textContent = '';
            toast.classList.add('hidden');
        }
        if (carromState.coinsToastTimer) {
            clearTimeout(carromState.coinsToastTimer);
            carromState.coinsToastTimer = 0;
        }
    }

    function showCarromCoinsToast(message) {
        const toast = document.getElementById('carromBoardCoinsToast');
        if (!toast || !message) return;
        clearCarromCoinsToast();
        toast.textContent = message;
        toast.classList.remove('hidden');
        carromState.coinsToastTimer = window.setTimeout(() => {
            clearCarromCoinsToast();
        }, 2000);
    }

    function renderCarromCoinsTracker(room) {
        const container = document.getElementById('carromCoinsTracker');
        if (!container) return;
        if (!room) {
            container.innerHTML = '';
            carromState.lastCoinsSnapshot = '';
            clearCarromCoinsToast();
            return;
        }

        const pieces = room.board?.pieces || [];
        const gameMode = getCarromGameMode(room);
        const entries = getAllowedCarromSeats(room.format).map(seatIndex => {
            const player = room.players?.[seatIndex];
            const team = getCarromTeamForSeat(room.format, seatIndex);
            const playerName = player?.name || getSeatInfo(seatIndex).label;
            const points = Number(room.board?.playerScores?.[seatIndex]) || 0;
            const ownCoinTypes = gameMode === 'coinpoints'
                ? ['ivory', 'ebony', 'queen']
                : [team];
            const pocketedPieces = pieces.filter(piece => ownCoinTypes.includes(piece.type) && piece.pocketed);
            const breakdown = {
                ebony: pocketedPieces.filter(piece => piece.type === 'ebony').length,
                ivory: pocketedPieces.filter(piece => piece.type === 'ivory').length,
                queen: pocketedPieces.filter(piece => piece.type === 'queen').length
            };
            return {
                seatIndex,
                title: playerName,
                points,
                breakdown
            };
        });

        container.innerHTML = entries.map(entry => `
            <details class="carrom-coins-card">
                <summary class="carrom-coins-summary">
                    <span>${escapeCarromHtml(entry.title)}</span>
                    <strong>${entry.points} points</strong>
                </summary>
                <div class="carrom-coins-head">
                    <div>
                        <div class="carrom-coins-team">Black: ${entry.breakdown.ebony} | White/Red: ${entry.breakdown.ivory} | Queen: ${entry.breakdown.queen}</div>
                    </div>
                </div>
            </details>
        `).join('');

        const snapshot = JSON.stringify(entries.map(entry => ({
            seatIndex: entry.seatIndex,
            points: entry.points,
            breakdown: entry.breakdown
        })));
        if (carromState.lastCoinsSnapshot && snapshot !== carromState.lastCoinsSnapshot) {
            const changedEntry = entries.find((entry, index) => {
                const prev = JSON.parse(carromState.lastCoinsSnapshot)[index];
                return prev && prev.points !== entry.points;
            }) || entries[0];
            if (changedEntry) {
                showCarromCoinsToast(`${changedEntry.title}: ${changedEntry.points} points`);
            }
        }
        carromState.lastCoinsSnapshot = snapshot;
    }

    function renderCarromShotList(room) {
        const list = document.getElementById('carromShotList');
        if (!list) return;
        const entries = room?.moveLog || [];
        if (!entries.length) {
            list.innerHTML = '<li>Room not started yet.</li>';
            return;
        }
        list.innerHTML = entries.slice(-8).reverse().map(entry => `<li>${entry}</li>`).join('');
    }

    function escapeCarromHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function formatCarromChatTime(value) {
        if (!value) return '';
        const timestamp = Number(value);
        if (!Number.isFinite(timestamp)) return '';
        try {
            return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        } catch (error) {
            return '';
        }
    }

    function isOwnCarromMessage(message) {
        if (!message) return false;
        if (message.sessionId && message.sessionId === carromState.sessionId) return true;
        return carromState.seatIndex != null && Number(message.seatIndex) === carromState.seatIndex;
    }

    function clearCarromBoardChatPreview(resetKey) {
        if (carromState.boardChatPreviewTimer) {
            clearTimeout(carromState.boardChatPreviewTimer);
            carromState.boardChatPreviewTimer = 0;
        }
        const overlay = document.getElementById('carromBoardChatOverlay');
        if (overlay) {
            overlay.innerHTML = '';
            overlay.classList.add('hidden');
        }
        if (resetKey !== false) {
            carromState.boardChatPreviewKey = '';
        }
    }

    function renderCarromBoardChatPreview(messages) {
        const overlay = document.getElementById('carromBoardChatOverlay');
        if (!overlay) return;
        if (!messages?.length) {
            clearCarromBoardChatPreview();
            return;
        }

        const latestMessage = messages[messages.length - 1];
        const previewKey = `${latestMessage?.createdAt || 0}:${latestMessage?.sessionId || latestMessage?.name || ''}:${latestMessage?.text || ''}`;
        if (!previewKey || previewKey === carromState.boardChatPreviewKey) {
            return;
        }

        const sender = escapeCarromHtml(latestMessage?.name || 'Player');
        const text = escapeCarromHtml(latestMessage?.text || '');
        const time = escapeCarromHtml(formatCarromChatTime(latestMessage?.createdAt));
        const ownClass = isOwnCarromMessage(latestMessage) ? ' own' : '';
        carromState.boardChatPreviewKey = previewKey;
        overlay.innerHTML = `
            <div class="carrom-board-chat-toast${ownClass}">
                <div class="carrom-board-chat-head">
                    <span class="carrom-board-chat-name">${sender}</span>
                    <span class="carrom-board-chat-time">${time}</span>
                </div>
                <div class="carrom-board-chat-text">${text}</div>
            </div>
        `;
        overlay.classList.remove('hidden');
        if (carromState.boardChatPreviewTimer) {
            clearTimeout(carromState.boardChatPreviewTimer);
        }
        carromState.boardChatPreviewTimer = window.setTimeout(() => {
            const liveOverlay = document.getElementById('carromBoardChatOverlay');
            if (!liveOverlay || carromState.boardChatPreviewKey !== previewKey) return;
            liveOverlay.innerHTML = '';
            liveOverlay.classList.add('hidden');
            carromState.boardChatPreviewTimer = 0;
        }, 1000);
    }

    function renderCarromChat(room) {
        const list = document.getElementById('carromChatList');
        const input = document.getElementById('carromChatInput');
        const sendBtn = document.getElementById('carromChatSendBtn');
        if (!list || !input || !sendBtn) return;

        if (!room) {
            list.innerHTML = '<li class="carrom-chat-empty">Create or join a room to start chatting.</li>';
            input.value = '';
            input.disabled = true;
            sendBtn.disabled = true;
            clearCarromBoardChatPreview();
            return;
        }

        const canChat = carromState.seatIndex != null;
        input.disabled = !canChat;
        sendBtn.disabled = !canChat;
        input.placeholder = canChat ? 'Type a room message' : 'Join a seat to chat';

        const messages = room.messages || [];
        if (!messages.length) {
            list.innerHTML = '<li class="carrom-chat-empty">No messages yet. Say hello to the table.</li>';
            clearCarromBoardChatPreview();
            return;
        }

        const recentMessages = messages.slice(-18);
        list.innerHTML = recentMessages.map(message => {
            const sender = escapeCarromHtml(message?.name || 'Player');
            const text = escapeCarromHtml(message?.text || '');
            const time = escapeCarromHtml(formatCarromChatTime(message?.createdAt));
            const rowClass = isOwnCarromMessage(message) ? 'own' : 'other';
            return `
                <li class="carrom-chat-row ${rowClass}">
                    <div class="carrom-chat-bubble">
                        <div class="carrom-chat-bubble-head">
                            <div class="carrom-chat-meta">${sender}</div>
                            <div class="carrom-chat-time">${time}</div>
                        </div>
                        <div class="carrom-chat-text">${text}</div>
                    </div>
                </li>
            `;
        }).join('');
        renderCarromBoardChatPreview(recentMessages);
        list.scrollTop = list.scrollHeight;
    }

    function updateCarromApprovalState(room) {
        const approvalCard = document.getElementById('carromApprovalCard');
        const approvalTitle = document.getElementById('carromApprovalTitle');
        const approvalText = document.getElementById('carromApprovalText');
        const approvalActions = document.getElementById('carromApprovalActions');
        const approvalQueueNav = document.getElementById('carromApprovalQueueNav');
        const approvalPrevBtn = document.getElementById('carromApprovalPrevBtn');
        const approvalNextBtn = document.getElementById('carromApprovalNextBtn');
        const approvalStartBtn = document.getElementById('carromApprovalStartBtn');
        const approvalPrimaryBtn = document.getElementById('carromApprovalPrimaryBtn');
        const approvalSecondaryBtn = document.getElementById('carromApprovalSecondaryBtn');
        const waitingCard = document.getElementById('carromWaitingCard');
        const waitingText = document.getElementById('carromWaitingText');
        const host = isLocalCarromHost(room);
        const pendingRequests = getPendingCarromJoinRequests(room);
        const pendingRequest = getCurrentCarromPendingRequest(room);
        const teamTurnRequest = getActiveCarromTeamTurnRequest(room);
        const localRequest = getLatestCarromJoinRequestForSession(room, carromState.sessionId);
        const showWaiting = !!room && !isLocalCarromHost(room) && carromState.seatIndex == null && !!localRequest;
        const showQuickStart = !!room && host && !pendingRequest && isCarromRoomFull(room) && room.status !== 'active' && room.status !== 'finished';
        const showTeamApproval = !!room && !!teamTurnRequest && carromState.seatIndex === teamTurnRequest.turnSeat;

        approvalCard?.classList.toggle('hidden', !(showTeamApproval || (host && (pendingRequest || showQuickStart))));
        waitingCard?.classList.toggle('hidden', !showWaiting);
        approvalActions?.classList.toggle('hidden', !(pendingRequest || showTeamApproval));
        approvalQueueNav?.classList.toggle('hidden', !(pendingRequests.length > 1 && pendingRequest));
        approvalStartBtn?.classList.toggle('hidden', !showQuickStart);

        if (approvalTitle) {
            approvalTitle.textContent = pendingRequest
                ? `${pendingRequest.name || 'Player'} wants to join (${carromState.approvalQueueIndex + 1}/${pendingRequests.length})`
                : showTeamApproval
                    ? 'Team Approval'
                    : 'Ready to Start';
        }

        if (approvalText) {
            approvalText.textContent = pendingRequest
                ? `${pendingRequest.name || 'A player'} is waiting to join this room. Use Approve to assign the next open seat, or Decline to reject later.`
                : showTeamApproval
                    ? `${teamTurnRequest.requestName || 'Your teammate'} wants to take this team shot from their own bottom side. Approve to hand them the current turn.`
                    : showQuickStart
                        ? 'Players approved. Start the match from here.'
                        : 'No pending request.';
        }

        if (approvalPrevBtn) {
            approvalPrevBtn.disabled = pendingRequests.length <= 1 || carromState.approvalQueueIndex <= 0;
        }

        if (approvalNextBtn) {
            approvalNextBtn.disabled = pendingRequests.length <= 1 || carromState.approvalQueueIndex >= pendingRequests.length - 1;
        }

        if (approvalPrimaryBtn) {
            approvalPrimaryBtn.textContent = showTeamApproval ? 'Approve Shot' : 'Approve';
            approvalPrimaryBtn.onclick = showTeamApproval ? () => window.approveCarromTeamApproval() : () => window.approveCarromJoinRequest();
        }

        if (approvalSecondaryBtn) {
            approvalSecondaryBtn.textContent = showTeamApproval ? 'Keep Turn' : 'Decline';
            approvalSecondaryBtn.onclick = showTeamApproval ? () => window.declineCarromTeamApproval() : () => window.declineCarromJoinRequest();
        }

        if (approvalStartBtn) {
            approvalStartBtn.disabled = !showQuickStart;
            approvalStartBtn.textContent = 'Start Match';
        }

        if (waitingText) {
            waitingText.textContent = localRequest?.status === 'declined'
                ? 'Host declined your join request. Send a fresh request when ready.'
                : 'Your join request is waiting for host approval.';
        }
    }

    function updateCarromActionState(room) {
        const requestTurnBtn = document.getElementById('carromRequestTurnBtn');
        const pauseBtn = document.getElementById('carromPauseBtn');
        const resetBtn = document.getElementById('carromResetBtn');
        const copyBtn = document.getElementById('carromCopyCodeBtn');
        const shareBtn = document.getElementById('carromShareCodeBtn');
        if (copyBtn) copyBtn.disabled = !room?.code;
        if (shareBtn) shareBtn.disabled = !room?.code;

        if (!pauseBtn || !resetBtn || !requestTurnBtn) return;
        if (!room) {
            requestTurnBtn.classList.add('hidden');
            requestTurnBtn.disabled = true;
            pauseBtn.disabled = true;
            pauseBtn.textContent = 'Pause Match';
            resetBtn.disabled = true;
            return;
        }

        const turnSeat = room.board?.turnSeat ?? 0;
        const localTeam = carromState.seatIndex == null ? '' : getCarromTeamForSeat(room.format, carromState.seatIndex);
        const turnTeam = getCarromTeamForSeat(room.format, turnSeat);
        const teamTurnRequest = getActiveCarromTeamTurnRequest(room);
        const showRequestTurn = room.format === 4
            && getCarromGameMode(room) === 'team'
            && room.status === 'active'
            && !room.board?.running
            && !isCarromPaused(room)
            && carromState.seatIndex != null
            && carromState.seatIndex !== turnSeat
            && localTeam === turnTeam;
        requestTurnBtn.classList.toggle('hidden', !showRequestTurn);
        requestTurnBtn.disabled = !showRequestTurn;
        requestTurnBtn.textContent = teamTurnRequest?.requestSeat === carromState.seatIndex
            ? (teamTurnRequest.status === 'approved' ? 'Shot Approved' : teamTurnRequest.status === 'declined' ? 'Request Again' : 'Approval Pending')
            : 'Request Team Approval';

        const seatedPlayer = carromState.seatIndex != null;
        pauseBtn.disabled = !seatedPlayer || !!room.board?.running;
        pauseBtn.textContent = isCarromPaused(room)
            ? (room.status === 'active' ? 'Resume Match' : 'Resume Room')
            : (room.status === 'active' ? 'Pause Match' : 'Pause Room');
        resetBtn.disabled = !isLocalCarromHost(room);
    }

    function setSidebarCardOrder(element, order) {
        if (!element) return;
        element.style.order = String(order);
    }

    function updateCarromSidebarLayout(room) {
        const sidebar = document.querySelector('.carrom-sidebar');
        const coinsCard = document.getElementById('carromCoinsCard');
        const chatCard = document.getElementById('carromChatCard');
        const roomControlCard = document.getElementById('carromRoomControlCard');
        const approvalCard = document.getElementById('carromApprovalCard');
        const waitingCard = document.getElementById('carromWaitingCard');
        const tableViewCard = document.getElementById('carromTableViewCard');
        const matchStatusCard = document.getElementById('carromMatchStatusCard');
        const shotFeedCard = document.getElementById('carromShotFeedCard');
        const actionCard = document.getElementById('carromActionCard');
        const liveMatch = room?.status === 'active' || room?.status === 'finished';

        if (chatCard) {
            chatCard.classList.toggle('hidden', !liveMatch);
        }
        if (coinsCard) {
            if (room) {
                coinsCard.classList.remove('hidden');
            } else {
                coinsCard.classList.add('hidden');
            }
        }
        if (sidebar && room) {
            sidebar.scrollTop = 0;
        }

        if (liveMatch) {
            setSidebarCardOrder(coinsCard, -9);
            setSidebarCardOrder(approvalCard, -8);
            setSidebarCardOrder(chatCard, -7);
            setSidebarCardOrder(tableViewCard, -6);
            setSidebarCardOrder(matchStatusCard, -5);
            setSidebarCardOrder(roomControlCard, -4);
            setSidebarCardOrder(shotFeedCard, -3);
            setSidebarCardOrder(actionCard, -2);
            setSidebarCardOrder(waitingCard, -1);
            return;
        }

        setSidebarCardOrder(coinsCard, -9);
        setSidebarCardOrder(approvalCard, -8);
        setSidebarCardOrder(roomControlCard, -7);
        setSidebarCardOrder(waitingCard, -6);
        setSidebarCardOrder(tableViewCard, -5);
        setSidebarCardOrder(matchStatusCard, -4);
        setSidebarCardOrder(actionCard, -3);
        setSidebarCardOrder(shotFeedCard, 0);
        setSidebarCardOrder(chatCard, 7);
    }

    function updateCarromRoomView(room) {
        const previousRoom = carromState.roomData;
        carromState.roomData = room;
        if (room) {
            carromState.gameMode = getCarromGameMode(room);
            setCarromGameMode(carromState.gameMode);
        }
        carromState.seatIndex = getCarromSeatBySession(room, carromState.sessionId);
        ensureCarromCanvasBindings();
        const previewOnlyUpdate = isCarromAimPreviewOnlyUpdate(previousRoom, room);
        if (previewOnlyUpdate) {
            if (!canLocalPlayCarrom(room)) {
                clearCarromAimState();
            }
            drawCarromBoard();
            return;
        }
        scheduleCarromShotWatchdog(room);
        toggleCarromPanels(!!room);
        renderCarromSeatCards(room);
        renderCarromScoreboard(room);
        renderCarromCoinsTracker(room);
        renderCarromShotList(room);
        renderCarromChat(room);
        updateCarromResultModal(room);
        updateCarromApprovalState(room);
        updateCarromActionState(room);
        updateCarromSidebarLayout(room);

        const roomCodeDisplay = document.getElementById('carromRoomCodeDisplay');
        const roomModeChip = document.getElementById('carromRoomModeChip');
        const turnChip = document.getElementById('carromTurnChip');
        const turnOwner = document.getElementById('carromTurnOwner');
        const teamTarget = document.getElementById('carromTeamTarget');
        const headline = document.getElementById('carromMatchHeadline');
        const queenStatus = document.getElementById('carromQueenStatus');
        const roleHint = document.getElementById('carromRoleHint');
        const hint = document.getElementById('carromAimHint');

        if (!room) {
            carromState.approvalPromptKey = '';
            carromState.approvalPromptOpen = false;
            carromState.brandFlashKey = '';
            clearCarromShotWatchdog();
            if (roomCodeDisplay) roomCodeDisplay.textContent = '------';
            if (roomModeChip) roomModeChip.textContent = 'Lobby Ready';
            if (turnChip) turnChip.textContent = 'Waiting';
            if (turnOwner) turnOwner.textContent = 'South Baseline';
            if (teamTarget) teamTarget.textContent = 'Ivory Team on deck';
            if (headline) headline.textContent = 'No live room';
            if (queenStatus) {
                queenStatus.textContent = 'Queen awaiting cover.';
                queenStatus.classList.add('hidden');
            }
            if (roleHint) roleHint.textContent = 'Choose Host Room or Join Room to begin.';
            if (hint) hint.textContent = 'When it is your turn, drag the striker across your lane, then pull outward on the board to load power and release.';
            cancelCarromSimulation();
            cancelCarromBrandFlash();
            clearCarromAimState();
            updateCarromSidebarLayout(null);
            updateCarromResultModal(null);
            drawCarromBoard();
            return;
        }

        const occupied = getOccupiedCarromSeats(room).length;
        const fullRoom = isCarromRoomFull(room);
        const turnSeat = room.board?.turnSeat ?? 0;
        const turnPlayer = room.players?.[turnSeat]?.name || getSeatInfo(turnSeat).label;
        const gameMode = getCarromGameMode(room);
        const turnTeam = getCarromTeamForSeat(room.format, turnSeat);
        const localTeam = carromState.seatIndex == null ? '' : getCarromTeamForSeat(room.format, carromState.seatIndex);
        const localSeatLabel = carromState.seatIndex == null ? 'No seat yet' : getSeatInfo(carromState.seatIndex).label;
        const teamTurnRequest = getActiveCarromTeamTurnRequest(room);
        const queenPendingSeat = room.board?.queenPendingOwnerSeat != null ? Number(room.board.queenPendingOwnerSeat) : null;
        const queenPendingName = queenPendingSeat != null ? (room.players?.[queenPendingSeat]?.name || getSeatInfo(queenPendingSeat).short) : '';
        const pendingRequests = getPendingCarromJoinRequests(room);
        const localJoinRequest = getLatestCarromJoinRequestForSession(room, carromState.sessionId);
        const localPendingRequest = carromState.seatIndex == null && localJoinRequest?.status === 'pending' ? localJoinRequest : null;
        const localDeclinedRequest = carromState.seatIndex == null && localJoinRequest?.status === 'declined' ? localJoinRequest : null;

        if (roomCodeDisplay) roomCodeDisplay.textContent = room.code || '------';
        if (roomModeChip) {
            roomModeChip.textContent = room.status === 'active'
                ? (isCarromPaused(room) ? 'Match Paused' : `${room.format}P ${gameMode === 'coinpoints' ? 'Coin Points' : gameMode === 'individual' ? 'Individual' : gameMode === 'team' ? 'Team' : 'Duel'} Live`)
                : room.status === 'finished'
                    ? 'Match Complete'
                    : (isCarromPaused(room) ? 'Room Paused' : pendingRequests.length ? 'Approval Queue' : `${occupied}/${room.format} Seats Filled`);
        }
        if (turnChip) {
            turnChip.textContent = room.status === 'active'
                ? (isCarromPaused(room) ? 'Paused' : `${getSeatInfo(turnSeat).short} to Shoot`)
                : isCarromPaused(room)
                    ? 'Paused'
                    : localPendingRequest
                        ? 'Pending'
                        : fullRoom
                            ? 'Ready to Start'
                            : 'Waiting';
        }
        if (turnOwner) turnOwner.textContent = `${getSeatInfo(turnSeat).label} • ${turnPlayer}`;
        if (teamTarget) {
            teamTarget.textContent = room.status === 'finished'
                ? (room.board?.winnerLabel || 'Board settled')
                : isCarromPaused(room)
                    ? (room.board?.pausedBy ? `Paused by ${room.board.pausedBy}` : 'Table paused')
                    : (isCarromPlayerPointsMode(gameMode) ? `${turnPlayer} on deck` : `${getTeamLabel(turnTeam)} on deck`);
        }
        if (queenStatus) {
            if (queenPendingSeat != null) {
                queenStatus.textContent = gameMode === 'coinpoints'
                    ? `Queen awaiting cover by ${queenPendingName}. Any normal coin can cover it.`
                    : `Queen awaiting cover by ${queenPendingName}. Wrong-color coin se cover valid nahi hoga.`;
                queenStatus.classList.remove('hidden');
            } else {
                queenStatus.textContent = 'Queen awaiting cover.';
                queenStatus.classList.add('hidden');
            }
        }
        if (headline) {
            headline.textContent = localPendingRequest
                ? 'Approval pending'
                : localDeclinedRequest
                    ? 'Request declined'
                    : room.status === 'active'
                        ? (isCarromPaused(room) ? 'Match paused' : `${turnPlayer} has the shot`)
                        : room.status === 'finished'
                            ? (room.board?.winnerLabel || 'Match complete')
                            : isCarromPaused(room)
                                ? 'Room paused'
                                : isLocalCarromHost(room) && pendingRequests.length
                                    ? 'Join requests waiting'
                                    : fullRoom
                                        ? 'Room full and ready'
                                        : `${occupied}/${room.format} players joined`;
        }
        if (roleHint) {
            roleHint.textContent = localPendingRequest
                ? 'Join request sent. Waiting for host approval.'
                : localDeclinedRequest
                    ? 'Host declined your last join request. Send a fresh request when ready.'
                    : carromState.seatIndex == null
                        ? 'You are not seated in this room yet.'
                        : `${localSeatLabel} • ${gameMode === 'coinpoints' ? 'Coin Points mode' : gameMode === 'individual' ? 'Individual mode' : getTeamLabel(localTeam)}${isLocalCarromHost(room) ? ' • Host controls enabled.' : ''}`;
        }
        if (hint) {
            if (room.status === 'finished') {
                hint.textContent = 'Host can reset the board for a fresh rack.';
            } else if (room.board?.running) {
                hint.textContent = 'Shot in progress. Watch the table settle before the next striker placement.';
            } else if (localPendingRequest) {
                hint.textContent = 'Host approval is pending. You will get the next open seat once the host accepts your request.';
            } else if (localDeclinedRequest) {
                hint.textContent = 'Your request was declined. You can send another join request from the same room.';
            } else if (isCarromPaused(room)) {
                hint.textContent = room.board?.pausedBy
                    ? `${room.board.pausedBy} paused the ${room.status === 'active' ? 'table' : 'room'}. Use ${room.status === 'active' ? 'Resume Match' : 'Resume Room'} when everyone is ready.`
                    : `The ${room.status === 'active' ? 'table' : 'room'} is paused. Resume anytime from the same state.`;
            } else if (teamTurnRequest?.requestSeat === carromState.seatIndex && teamTurnRequest.status === 'pending') {
                hint.textContent = 'Teammate approval pending. Once approved, you can shoot from your own bottom side.';
            } else if (teamTurnRequest?.requestSeat === carromState.seatIndex && teamTurnRequest.status === 'approved') {
                hint.textContent = 'Team approval granted. You can now shoot from your own bottom side, while your teammate will see it from the opposite side.';
            } else if (teamTurnRequest?.requestSeat === carromState.seatIndex && teamTurnRequest.status === 'declined') {
                hint.textContent = 'Teammate kept the turn. Request again only if needed.';
            } else if (teamTurnRequest && carromState.seatIndex === teamTurnRequest.turnSeat) {
                hint.textContent = `${teamTurnRequest.requestName || 'Your teammate'} wants to take this team shot from their bottom side. Approve or keep the turn from the top card.`;
            } else if (canLocalPlayCarrom(room)) {
                hint.textContent = gameMode === 'team' && room.format === 4 && carromState.seatIndex !== turnSeat
                    ? `Team turn approved for ${localSeatLabel}. Aap apni bottom side se shoot karoge. Move mouse to place striker, right double click to lock aim.`
                    : 'Your turn. Move mouse to place striker, right double click to lock aim, then left click to shoot.';
            } else if (room.status === 'active') {
                hint.textContent = `${turnPlayer} is up. Their striker and aim direction will show live on your board.`;
            } else if (fullRoom) {
                hint.textContent = 'The room is full. Host can start the match whenever ready.';
            } else {
                hint.textContent = `Waiting for ${room.format - occupied} more player${room.format - occupied === 1 ? '' : 's'} to fill the table.`;
            }
        }

        if (localPendingRequest) {
            setCarromNotice(`Join request sent to room ${room.code}. Waiting for host approval.`);
        } else if (localDeclinedRequest) {
            setCarromNotice('Host declined your join request. Send a fresh request when ready.');
        } else if (isLocalCarromHost(room) && pendingRequests.length) {
            setCarromNotice(`${pendingRequests[0].name || 'A player'} wants to join. Approve or decline the request.`);
        } else {
            setCarromNotice(room.board?.resultText || room.resultText || 'Room ready.');
        }

        const nextBrandFlashId = room.brandFlash?.id || '';
        const previousBrandFlashId = previousRoom?.brandFlash?.id || '';
        if (!previousRoom || previousRoom.code !== room.code) {
            carromState.brandFlashKey = nextBrandFlashId;
            cancelCarromBrandFlash();
        } else if (nextBrandFlashId && nextBrandFlashId !== previousBrandFlashId && nextBrandFlashId !== carromState.brandFlashKey) {
            carromState.brandFlashKey = nextBrandFlashId;
            startCarromBrandFlash(room.brandFlash);
        } else if (!nextBrandFlashId) {
            carromState.brandFlashKey = '';
        }

        const activeShot = room.board?.shot;
        if (activeShot) {
            startCarromShotSimulation(room, activeShot);
            maybeRecoverStaleCarromShot(room);
        } else if (carromState.simBoard) {
            cancelCarromSimulation();
            clearCarromShotWatchdog();
        }
        if (!canLocalPlayCarrom(room)) {
            clearCarromAimState();
        }
        drawCarromBoard();
    }

    function listenToCarromRoom(code) {
        cleanupCarromSubscription();
        carromState.unsubscribe = onValue(getCarromRoomRef(code), snapshot => {
            if (!snapshot.exists()) {
                const roomWasOpen = !!carromState.roomCode;
                cancelCarromSimulation();
                clearCarromAimState();
                carromState.roomCode = '';
                updateCarromRoomView(null);
                if (roomWasOpen) {
                    setCarromNotice('This carrom room closed or was removed.');
                }
                return;
            }
            const room = normalizeCarromRoomData(snapshot.val());
            carromState.roomCode = room.code || code;
            updateCarromRoomView(room);
            maybePromptCarromApproval(room);
        });
    }

    async function createCarromRoom() {
        const hostName = (document.getElementById('carromHostNameInput')?.value || '').trim();
        if (!hostName) {
            setCarromNotice('Enter your host name before creating a room.');
            return;
        }
        carromState.roomSize = 2;
        setCarromPlayerName(hostName);

        let code = generateCarromRoomCode();
        let snapshot = await get(getCarromRoomRef(code));
        while (snapshot.exists()) {
            code = generateCarromRoomCode();
            snapshot = await get(getCarromRoomRef(code));
        }

        const format = carromState.roomSize;
        const gameMode = carromState.gameMode === 'coinpoints' ? 'coinpoints' : (format === 4 ? carromState.gameMode : 'duel');
        const roomPayload = {
            code,
            format,
            gameMode,
            status: 'waiting',
            hostSessionId: carromState.sessionId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            players: {
                0: {
                    name: hostName,
                    sessionId: carromState.sessionId,
                    joinedAt: Date.now()
                }
            },
            board: buildInitialCarromBoard(format),
            brandFlash: null,
            joinRequests: {},
            moveLog: [],
            resultText: `${format}-player ${gameMode === 'coinpoints' ? 'coin points' : gameMode === 'individual' ? 'individual' : gameMode === 'team' ? 'team' : 'duel'} room created. Share the code and fill the table.`
        };

        carromState.roomCode = code;
        updateCarromRoomView(normalizeCarromRoomData(roomPayload));
        setCarromNotice(`Room ${code} created. Share the code and wait for players.`);

        try {
            await set(getCarromRoomRef(code), roomPayload);
            listenToCarromRoom(code);
        } catch (error) {
            carromState.roomCode = '';
            updateCarromRoomView(null);
            setCarromNotice(`The room could not be created. Firebase error: ${error?.message || 'Unknown error'}`);
        }
    }

    async function joinCarromRoom() {
        const guestName = (document.getElementById('carromGuestNameInput')?.value || '').trim();
        const code = (document.getElementById('carromRoomCodeInput')?.value || '').trim().toUpperCase();
        if (!guestName || !code) {
            setCarromNotice('Enter your name and the room code before joining.');
            return;
        }

        try {
            const snapshot = await get(getCarromRoomRef(code));
            if (!snapshot.exists()) {
                setCarromNotice('Room not found. Check the code and try again.');
                return;
            }

            const room = normalizeCarromRoomData(snapshot.val());
            const existingSeat = getCarromSeatBySession(room, carromState.sessionId);
            if (existingSeat != null) {
                setCarromPlayerName(guestName);
                carromState.roomCode = code;
                listenToCarromRoom(code);
                setCarromNotice(`${guestName} rejoined the ${getSeatInfo(existingSeat).short} seat.`);
                return;
            }

            if (room.status === 'active') {
                setCarromNotice('This table is currently live. Wait for the next match reset.');
                return;
            }

            const localRequest = getLatestCarromJoinRequestForSession(room, carromState.sessionId);
            if (localRequest?.status === 'pending') {
                carromState.roomCode = code;
                listenToCarromRoom(code);
                setCarromNotice(`Join request already sent to room ${code}. Waiting for host approval.`);
                return;
            }

            const occupiedCount = getOccupiedCarromSeats(room).length;
            const otherPendingCount = getPendingCarromJoinRequests(room).filter(request => request.sessionId !== carromState.sessionId).length;
            if (occupiedCount + otherPendingCount >= room.format) {
                setCarromNotice('This carrom room already has full seats or pending approvals. Wait for the host response.');
                return;
            }

            setCarromPlayerName(guestName);
            const requestTime = Date.now();
            const requestId = `carrom_request_${requestTime}_${Math.random().toString(36).slice(2, 7)}`;
            const nextJoinRequests = [
                ...(room.joinRequests || []).filter(request => request.sessionId !== carromState.sessionId),
                {
                    id: requestId,
                    name: guestName,
                    sessionId: carromState.sessionId,
                    status: 'pending',
                    requestedAt: requestTime,
                    updatedAt: requestTime
                }
            ].sort((left, right) => (left?.requestedAt || 0) - (right?.requestedAt || 0));
            const resultText = `${guestName} requested to join. Host approval pending.`;

            await update(getCarromRoomRef(code), {
                joinRequests: serializeCarromJoinRequests(nextJoinRequests),
                resultText,
                updatedAt: requestTime
            });

            carromState.roomCode = code;
            listenToCarromRoom(code);
            setCarromNotice(`Join request sent to room ${code}. Waiting for host approval.`);
        } catch (error) {
            setCarromNotice(`The join request failed. Firebase error: ${error?.message || 'Unknown error'}`);
        }
    }

    window.approveCarromJoinRequest = async function (requestId) {
        const room = carromState.roomData;
        if (!isLocalCarromHost(room) || !room?.code) {
            setCarromNotice('Only the host can approve join requests.');
            return;
        }

        const pendingRequests = getPendingCarromJoinRequests(room);
        const request = pendingRequests.find(item => item.id === requestId) || getCurrentCarromPendingRequest(room) || pendingRequests[0];
        if (!request) {
            setCarromNotice('No pending carrom join request to approve.');
            return;
        }

        const requestTime = Date.now();
        const openSeat = getNextOpenCarromSeat(room);
        if (openSeat == null) {
            const declinedRequests = (room.joinRequests || []).map(item => item.id === request.id
                ? { ...item, status: 'declined', updatedAt: requestTime }
                : item);
            carromState.approvalPromptKey = '';
            carromState.approvalPromptOpen = false;
            await update(getCarromRoomRef(room.code), {
                joinRequests: serializeCarromJoinRequests(declinedRequests),
                resultText: `No open seat left for ${request.name || 'that player'}.`,
                updatedAt: requestTime
            });
            return;
        }

        const players = {
            ...room.players,
            [openSeat]: {
                name: request.name,
                sessionId: request.sessionId,
                joinedAt: requestTime
            }
        };
        const nextJoinRequests = (room.joinRequests || []).filter(item => item.id !== request.id);
        const nextOccupiedCount = getAllowedCarromSeats(room.format).filter(seatIndex => players[seatIndex]).length;
        const resultText = `${request.name} joined the ${getSeatInfo(openSeat).short} seat. ${nextOccupiedCount}/${room.format} seats filled.`;
        carromState.approvalQueueIndex = Math.min(carromState.approvalQueueIndex, Math.max(0, getPendingCarromJoinRequests({ ...room, joinRequests: nextJoinRequests }).length - 1));

        carromState.approvalPromptKey = '';
        carromState.approvalPromptOpen = false;
        await update(getCarromRoomRef(room.code), {
            players,
            joinRequests: serializeCarromJoinRequests(nextJoinRequests),
            status: room.status === 'finished' ? 'waiting' : room.status,
            resultText,
            updatedAt: requestTime
        });
    };

    window.declineCarromJoinRequest = async function (requestId) {
        const room = carromState.roomData;
        if (!isLocalCarromHost(room) || !room?.code) {
            setCarromNotice('Only the host can decline join requests.');
            return;
        }

        const pendingRequests = getPendingCarromJoinRequests(room);
        const request = pendingRequests.find(item => item.id === requestId) || getCurrentCarromPendingRequest(room) || pendingRequests[0];
        if (!request) {
            setCarromNotice('No pending carrom join request to decline.');
            return;
        }

        const requestTime = Date.now();
        const nextJoinRequests = (room.joinRequests || []).map(item => item.id === request.id
            ? { ...item, status: 'declined', updatedAt: requestTime }
            : item);
        carromState.approvalQueueIndex = Math.min(carromState.approvalQueueIndex, Math.max(0, getPendingCarromJoinRequests({ ...room, joinRequests: nextJoinRequests }).length - 1));
        carromState.approvalPromptKey = '';
        carromState.approvalPromptOpen = false;
        await update(getCarromRoomRef(room.code), {
            joinRequests: serializeCarromJoinRequests(nextJoinRequests),
            resultText: `${request.name || 'A player'} was declined by the host.`,
            updatedAt: requestTime
        });
    };

    window.showPreviousCarromApproval = function () {
        const room = carromState.roomData;
        const pendingRequests = getPendingCarromJoinRequests(room);
        if (pendingRequests.length <= 1) return;
        carromState.approvalQueueIndex = Math.max(0, carromState.approvalQueueIndex - 1);
        updateCarromRoomView(room);
    };

    window.showNextCarromApproval = function () {
        const room = carromState.roomData;
        const pendingRequests = getPendingCarromJoinRequests(room);
        if (pendingRequests.length <= 1) return;
        carromState.approvalQueueIndex = Math.min(pendingRequests.length - 1, carromState.approvalQueueIndex + 1);
        updateCarromRoomView(room);
    };

    window.requestCarromTeamApproval = async function () {
        const room = carromState.roomData;
        if (!room || room.format !== 4 || getCarromGameMode(room) !== 'team' || carromState.seatIndex == null) return;
        const turnSeat = room.board?.turnSeat ?? 0;
        if (carromState.seatIndex === turnSeat) {
            setCarromNotice('You already have the shot. No teammate approval needed.');
            return;
        }
        if (getCarromTeamForSeat(room.format, carromState.seatIndex) !== getCarromTeamForSeat(room.format, turnSeat)) {
            setCarromNotice('Only the active team can request this shot.');
            return;
        }
        if (room.status !== 'active' || room.board?.running || isCarromPaused(room)) {
            setCarromNotice('Request approval when the table is active and ready.');
            return;
        }
        const updatedAt = Date.now();
        await update(getCarromRoomRef(room.code), {
            'board/teamTurnRequest': {
                status: 'pending',
                turnSeat,
                requestSeat: carromState.seatIndex,
                requestName: room.players?.[carromState.seatIndex]?.name || getSeatInfo(carromState.seatIndex).short,
                requestedAt: updatedAt
            },
            updatedAt
        });
        setCarromNotice('Team approval requested. Wait for your teammate response.');
    };

    window.approveCarromTeamApproval = async function () {
        const room = carromState.roomData;
        const request = getActiveCarromTeamTurnRequest(room);
        if (!room || !request || carromState.seatIndex !== request.turnSeat) return;
        const updatedAt = Date.now();
        await update(getCarromRoomRef(room.code), {
            'board/teamTurnRequest': {
                ...request,
                status: 'approved',
                approvedSeat: request.requestSeat,
                approvedAt: updatedAt
            },
            resultText: `${request.requestName || 'Teammate'} is approved to shoot from their bottom side.`,
            updatedAt
        });
    };

    window.declineCarromTeamApproval = async function () {
        const room = carromState.roomData;
        const request = getActiveCarromTeamTurnRequest(room);
        if (!room || !request || carromState.seatIndex !== request.turnSeat) return;
        const updatedAt = Date.now();
        await update(getCarromRoomRef(room.code), {
            'board/teamTurnRequest': {
                ...request,
                status: 'declined',
                declinedAt: updatedAt
            },
            resultText: `${request.requestName || 'Teammate'} needs fresh team approval before shooting.`,
            updatedAt
        });
    };

    async function startCarromMatchIfHost() {
        const room = carromState.roomData;
        if (!isLocalCarromHost(room)) {
            setCarromNotice('Only the host can start the carrom match.');
            return;
        }
        if (!isCarromRoomFull(room)) {
            setCarromNotice(`Need ${room.format} players before starting the match.`);
            return;
        }

        const nextBoard = buildInitialCarromBoard(room.format);
        nextBoard.gameMode = getCarromGameMode(room);
        nextBoard.resultText = `Match live. ${room.players?.[0]?.name || 'South Seat'} opens the break from the South side.`;

        try {
            await update(getCarromRoomRef(room.code), {
                status: 'active',
                gameMode: getCarromGameMode(room),
                board: nextBoard,
                brandFlash: null,
                moveLog: [`${room.players?.[0]?.name || 'Host'} opened a fresh rack.`],
                resultText: nextBoard.resultText,
                updatedAt: Date.now()
            });
        } catch (error) {
            setCarromNotice(`Match start failed. Firebase error: ${error?.message || 'Unknown error'}`);
        }
    }

    async function resetCarromMatchIfHost() {
        const room = carromState.roomData;
        if (!isLocalCarromHost(room)) {
            setCarromNotice('Only the host can reset the board.');
            return;
        }

        const fullRoom = isCarromRoomFull(room);
        const nextBoard = buildInitialCarromBoard(room.format);
        nextBoard.gameMode = getCarromGameMode(room);
        nextBoard.resultText = fullRoom
            ? `Fresh rack ready. ${room.players?.[0]?.name || 'South Seat'} breaks first again.`
            : 'Board reset. Waiting for all seats to fill.';

        try {
            await update(getCarromRoomRef(room.code), {
                status: fullRoom ? 'active' : 'waiting',
                gameMode: getCarromGameMode(room),
                board: nextBoard,
                brandFlash: null,
                moveLog: [],
                resultText: nextBoard.resultText,
                updatedAt: Date.now()
            });
        } catch (error) {
            setCarromNotice(`Board reset failed. Firebase error: ${error?.message || 'Unknown error'}`);
        }
    }

    async function toggleCarromPause() {
        const room = carromState.roomData;
        if (!room) {
            setCarromNotice('Create or join a room before using pause.');
            return;
        }
        if (room.board?.running) {
            setCarromNotice('Wait for the current shot to finish before pausing.');
            return;
        }
        if (carromState.seatIndex == null) {
            setCarromNotice('Join a seat in the room before controlling pause/resume.');
            return;
        }

        const actor = room.players?.[carromState.seatIndex]?.name || 'Player';
        const nextPaused = !isCarromPaused(room);
        const targetLabel = room.status === 'active' ? 'table' : 'room';
        const resultText = nextPaused
            ? `${actor} paused the ${targetLabel}. State is saved and can resume anytime.`
            : `${actor} resumed the ${targetLabel}. Everything continues from the same state.`;

        try {
            await update(getCarromRoomRef(room.code), {
                board: {
                    ...room.board,
                    paused: nextPaused,
                    pausedBy: nextPaused ? actor : '',
                    pausedAt: nextPaused ? Date.now() : 0,
                    resultText
                },
                resultText,
                updatedAt: Date.now()
            });
        } catch (error) {
            setCarromNotice(`Pause state update failed. Firebase error: ${error?.message || 'Unknown error'}`);
        }
    }

    async function sendCarromChatMessage() {
        const room = carromState.roomData;
        const input = document.getElementById('carromChatInput');
        if (!room || !input) {
            setCarromNotice('Create or join a room before sending chat.');
            return;
        }
        if (carromState.seatIndex == null) {
            setCarromNotice('Join a seat in the room before sending chat.');
            return;
        }

        const text = input.value.trim();
        if (!text) return;

        const player = room.players?.[carromState.seatIndex];
        try {
            await push(getCarromMessagesRef(room.code), {
                name: player?.name || 'Player',
                seatIndex: carromState.seatIndex,
                sessionId: carromState.sessionId,
                text,
                createdAt: Date.now()
            });
            input.value = '';
        } catch (error) {
            setCarromNotice(`Chat send failed. Firebase error: ${error?.message || 'Unknown error'}`);
        }
    }

    async function copyCarromRoomCode() {
        if (!carromState.roomCode) {
            setCarromNotice('Create or join a room first to copy the code.');
            return;
        }
        try {
            await navigator.clipboard.writeText(carromState.roomCode);
            setCarromNotice(`Room code ${carromState.roomCode} copied. Share it with the table.`);
        } catch (error) {
            setCarromNotice(`Room code: ${carromState.roomCode}`);
        }
    }

    async function shareCarromCodeToExternalChat() {
        if (!carromState.roomCode || !carromState.roomData) {
            setCarromNotice('Create or join a room first to share the code.');
            return;
        }
        const room = carromState.roomData;
        const modeLabel = room.format === 4
            ? (getCarromGameMode(room) === 'coinpoints' ? 'Carrom code (4 players coin points)' : getCarromGameMode(room) === 'individual' ? 'Carrom code (4 players individual)' : 'Carrom code (4 players team)')
            : 'Carrom code (2 players)';
        try {
            const createdAt = Date.now();
            const autoDeleteAt = createdAt + 300000;
            const commentRef = await push(commentsRef, {
                message: `${modeLabel}: ${carromState.roomCode} // ${room.players?.[0]?.name || 'Host'}`,
                username: 'Carrom Host',
                timestamp: createdAt,
                autoDeleteAt,
                messageType: 'game_code'
            });
            scheduleExternalCodeMessageDeletion(commentRef.key, autoDeleteAt);
            toggleChat(true);
            setCarromNotice(`Carrom room code ${carromState.roomCode} was shared in external chat.`);
        } catch (error) {
            setCarromNotice(`External chat share failed. Firebase error: ${error?.message || 'Unknown error'}`);
        }
    }

    window.openExternalChatForCarrom = function (event) {
        event?.stopPropagation?.();
        toggleChat(true);
        const chatInput = document.getElementById('chatMessage');
        if (chatInput && carromState.roomCode && carromState.roomData) {
            const room = carromState.roomData;
            const modeLabel = room.format === 4
                ? (getCarromGameMode(room) === 'coinpoints' ? 'Carrom code (4 players coin points)' : getCarromGameMode(room) === 'individual' ? 'Carrom code (4 players individual)' : 'Carrom code (4 players team)')
                : 'Carrom code (2 players)';
            chatInput.value = `${modeLabel}: ${carromState.roomCode} // ${room.players?.[0]?.name || 'Host'}`;
        }
        chatInput?.focus();
    };

    async function internalLeaveCarromRoom(closeOverlay) {
        const room = carromState.roomData;
        const code = carromState.roomCode;
        const seatIndex = carromState.seatIndex;

        cleanupCarromSubscription();
        cancelCarromSimulation();
        cancelCarromBrandFlash();
        clearCarromAimState();

        carromState.roomCode = '';
        carromState.roomData = null;
        carromState.seatIndex = null;
        carromState.approvalPromptKey = '';
        carromState.approvalPromptOpen = false;

        if (code && room) {
            try {
                const roomRef = getCarromRoomRef(code);
                if (isLocalCarromHost(room)) {
                    await remove(roomRef);
                } else if (seatIndex != null) {
                    const nextPlayers = { ...room.players };
                    delete nextPlayers[seatIndex];
                    const remainingSeats = getAllowedCarromSeats(room.format).filter(index => nextPlayers[index]);
                    if (!remainingSeats.length) {
                        await remove(roomRef);
                    } else {
                        const nextBoard = buildInitialCarromBoard(room.format);
                        nextBoard.gameMode = getCarromGameMode(room);
                        await update(roomRef, {
                            players: nextPlayers,
                            status: 'waiting',
                            gameMode: getCarromGameMode(room),
                            board: nextBoard,
                            brandFlash: null,
                            moveLog: [],
                            resultText: `${getSeatInfo(seatIndex).short} seat left the table. Room reset and waiting for players.`,
                            updatedAt: Date.now()
                        });
                    }
                } else {
                    const nextJoinRequests = (room.joinRequests || []).filter(request => request.sessionId !== carromState.sessionId);
                    if (nextJoinRequests.length !== (room.joinRequests || []).length) {
                        await update(roomRef, {
                            joinRequests: serializeCarromJoinRequests(nextJoinRequests),
                            updatedAt: Date.now()
                        });
                    }
                }
            } catch (error) { }
        }

        updateCarromRoomView(null);
        if (closeOverlay) {
            document.getElementById('carromGameOverlay')?.classList.remove('active');
        }
    }

    function closeCarromResultModal() {
        document.getElementById('carromResultModal')?.classList.add('hidden');
    }

    function updateCarromResultModal(room) {
        const modal = document.getElementById('carromResultModal');
        const badge = document.getElementById('carromResultBadge');
        const title = document.getElementById('carromResultTitle');
        const text = document.getElementById('carromResultText');
        const restartBtn = document.getElementById('carromResultRestartBtn');
        if (!modal || !badge || !title || !text || !restartBtn) return;

        if (!room || room.status !== 'finished' || !room.board?.winnerLabel) {
            carromState.resultModalKey = '';
            modal.classList.add('hidden');
            return;
        }

        const key = `${room.updatedAt || 0}:${room.board?.winnerLabel || ''}`;
        if (key !== carromState.resultModalKey) {
            modal.classList.remove('hidden');
            carromState.resultModalKey = key;
        }

        const winners = (room.board?.winnerSeats || []).map(seatIndex => room.players?.[seatIndex]?.name || getSeatInfo(seatIndex).short);
        badge.textContent = 'Carrom Finished';
        title.textContent = room.board?.winnerLabel || 'Match Complete';
        text.textContent = winners.length
            ? `${winners.join(' + ')} won the match.`
            : (room.board?.resultText || room.resultText || 'Match complete.');
        restartBtn.disabled = !isLocalCarromHost(room);
    }

    window.switchCarromMode = function (mode) {
        setCarromMode(mode);
    };

    window.setCarromRoomSize = function (size) {
        setCarromRoomSize(size);
    };
    window.setCarromGameMode = function (mode) {
        setCarromGameMode(mode);
    };

    window.prepareCarromOverlay = function () {
        ensureCarromCanvasBindings();
        const storedName = getCarromPlayerName();
        const hostInput = document.getElementById('carromHostNameInput');
        const guestInput = document.getElementById('carromGuestNameInput');
        const codeInput = document.getElementById('carromRoomCodeInput');
        if (hostInput) hostInput.value = storedName;
        if (guestInput) guestInput.value = storedName;
        if (codeInput) codeInput.value = '';
        if (carromState.roomData && carromState.roomCode) {
            updateCarromRoomView(carromState.roomData);
            return;
        }
        carromState.localStrikerPercent = 50;
        clearCarromAimState();
        setCarromMode('host');
        setCarromRoomSize(carromState.roomSize);
        setCarromGameMode(carromState.gameMode);
        updateCarromModeVisibility();
        if (!carromState.roomCode) {
            updateCarromRoomView(null);
        } else {
            drawCarromBoard();
        }
    };

    window.createCarromRoom = createCarromRoom;
    window.joinCarromRoom = joinCarromRoom;
    window.startCarromMatchIfHost = startCarromMatchIfHost;
    window.toggleCarromPause = toggleCarromPause;
    window.handleCarromJoinKey = function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            joinCarromRoom();
        }
    };
    window.sendCarromChatMessage = sendCarromChatMessage;
    window.handleCarromChatKey = function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendCarromChatMessage();
        }
    };
    window.resetCarromMatchIfHost = resetCarromMatchIfHost;
    window.copyCarromRoomCode = copyCarromRoomCode;
    window.shareCarromCodeToExternalChat = shareCarromCodeToExternalChat;
    window.closeCarromResultModal = closeCarromResultModal;
    window.leaveCarromRoom = function () {
        internalLeaveCarromRoom(true).then(() => openGameHub());
    };

    const originalBackToHub = window.backToHub;
    window.backToHub = function (overlayId) {
        if (overlayId === 'carromGameOverlay') {
            document.getElementById('carromGameOverlay')?.classList.remove('active');
            openGameHub();
            return;
        }
        if (originalBackToHub) originalBackToHub(overlayId);
    };
})();

// #region CALM GITHUB AUDIO PLAYER
(function () {
    const CALM_PASSWORD = 'ang';
    const GITHUB_REPO_API_URL = 'https://api.github.com/repos/ntqueprince/CVANG_VAHAN';
    const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm'];

    let calmTracks = [];
    let calmCurrentIndex = -1;
    let calmShuffle = false;
    let calmRepeatMode = 0; // 0=off, 1=one, 2=all
    let calmVolume = 0.8;
    let calmPreviousVolume = 0.8;
    let calmAudioBound = false;
    let calmSeekDragging = false;
    let calmRepoDefaultBranch = '';
    let calmSearchQuery = '';

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function formatSize(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function cleanTrackName(filename) {
        return filename
            .replace(/\.[^.]+$/, '')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeCalmSearch(value) {
        return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function getCalmFilteredEntries() {
        const query = normalizeCalmSearch(calmSearchQuery);
        return calmTracks
            .map((track, index) => ({ track, index }))
            .filter(({ track }) => {
                if (!query) return true;
                const haystack = normalizeCalmSearch(`${track.label} ${track.path} ${track.filename}`);
                return haystack.includes(query);
            });
    }

    function encodeGitHubPath(path) {
        return String(path || '')
            .split('/')
            .map((segment) => encodeURIComponent(segment))
            .join('/');
    }

    async function getCalmDefaultBranch() {
        if (calmRepoDefaultBranch) return calmRepoDefaultBranch;

        const response = await fetch(GITHUB_REPO_API_URL, {
            headers: {
                Accept: 'application/vnd.github+json'
            }
        });

        if (!response.ok) {
            throw new Error(`GitHub repo error: ${response.status}`);
        }

        const repo = await response.json();
        calmRepoDefaultBranch = repo?.default_branch || 'main';
        return calmRepoDefaultBranch;
    }

    async function getCalmRepoAudioFiles() {
        const branch = await getCalmDefaultBranch();
        const response = await fetch(`${GITHUB_REPO_API_URL}/git/trees/${encodeURIComponent(branch)}?recursive=1`, {
            headers: {
                Accept: 'application/vnd.github+json'
            }
        });

        if (!response.ok) {
            throw new Error(`GitHub tree error: ${response.status}`);
        }

        const payload = await response.json();
        const tree = Array.isArray(payload?.tree) ? payload.tree : [];

        return tree
            .filter((file) => file && file.type === 'blob' && AUDIO_EXTENSIONS.some((ext) => file.path.toLowerCase().endsWith(ext)))
            .map((file) => ({
                filename: file.path.split('/').pop() || file.path,
                path: file.path,
                label: cleanTrackName(file.path.split('/').pop() || file.path),
                src: `https://raw.githubusercontent.com/ntqueprince/CVANG_VAHAN/${encodeURIComponent(branch)}/${encodeGitHubPath(file.path)}`,
                sizeLabel: formatSize(file.size || 0)
            }))
            .sort((a, b) => a.path.localeCompare(b.path));
    }

    function getCalmAudio() {
        return document.getElementById('calmAudioPlayer');
    }

    function updateCalmVolumeIcon(volume) {
        const icon = document.getElementById('calmVolumeIcon');
        if (!icon) return;
        if (volume <= 0) icon.textContent = '🔇';
        else if (volume < 0.45) icon.textContent = '🔉';
        else icon.textContent = '🔊';
    }

    function updateCalmMiniPlayer() {
        const mini = document.getElementById('calmMiniPlayer');
        const text = document.getElementById('calmMiniPlayerText');
        const overlay = document.getElementById('calmOverlay');
        const audio = getCalmAudio();
        const track = calmTracks[calmCurrentIndex];
        const isPlaying = !!audio && !audio.paused && !!audio.src;

        if (text) {
            text.textContent = track ? `${track.label} • CALM Playing` : 'CALM Playing...';
        }

        if (!mini) return;
        const overlayOpen = !!overlay && overlay.classList.contains('active');
        if (isPlaying && !overlayOpen) {
            mini.style.display = 'flex';
        } else {
            mini.style.display = 'none';
        }
    }

    function updateCalmPlaybackVisuals(isPlaying) {
        const playBtn = document.getElementById('calmPlayPauseBtn');
        const disc = document.getElementById('calmDisc');
        if (playBtn) playBtn.textContent = isPlaying ? '❚❚' : '▶';
        if (disc) disc.classList.toggle('spinning', !!isPlaying);
        updateCalmMiniPlayer();
    }

    function renderCalmTracks() {
        const trackList = document.getElementById('calmTrackList');
        const subtitle = document.getElementById('calmListSubtitle');
        const status = document.getElementById('calmStatusMessage');
        const searchInput = document.getElementById('calmSearchInput');

        if (!trackList) return;
        trackList.innerHTML = '';
        if (searchInput && searchInput.value !== calmSearchQuery) searchInput.value = calmSearchQuery;

        if (!calmTracks.length) {
            if (subtitle) subtitle.textContent = 'No songs';
            if (status) {
                status.textContent = 'No songs found.';
                status.classList.remove('hidden');
            }
            return;
        }

        const entries = getCalmFilteredEntries();
        const hasSearch = !!normalizeCalmSearch(calmSearchQuery);
        if (subtitle) {
            subtitle.textContent = hasSearch
                ? `${entries.length}/${calmTracks.length} songs`
                : `${calmTracks.length} songs`;
        }

        if (!entries.length) {
            if (status) {
                status.textContent = 'No match.';
                status.classList.remove('hidden');
            }
            return;
        }

        if (status) status.classList.add('hidden');

        entries.forEach(({ track, index }, visibleIndex) => {
            const item = document.createElement('li');
            item.className = `calm-track-item${index === calmCurrentIndex ? ' active' : ''}`;
            item.innerHTML = `
                <div class="calm-track-index">${visibleIndex + 1}</div>
                <div class="calm-track-copy">
                    <div class="calm-track-name">${track.label}</div>
                    <div class="calm-track-extra">${track.path}${track.sizeLabel ? ` • ${track.sizeLabel}` : ''}</div>
                </div>
                <div class="calm-track-action">${index === calmCurrentIndex ? 'Now Playing' : 'Play'}</div>
            `;
            item.addEventListener('click', function () {
                window.playCalmTrack(index);
            });
            trackList.appendChild(item);
        });
    }

    async function fetchCalmTracks() {
        const status = document.getElementById('calmStatusMessage');
        const subtitle = document.getElementById('calmListSubtitle');
        if (status) {
            status.textContent = 'Loading songs...';
            status.classList.remove('hidden');
        }
        if (subtitle) subtitle.textContent = 'Loading...';

        try {
            calmTracks = await getCalmRepoAudioFiles();

            renderCalmTracks();

            if (!calmTracks.length && status) {
                status.textContent = 'No songs found.';
            }
        } catch (error) {
            console.error('CALM fetch error:', error);
            if (subtitle) subtitle.textContent = 'Load failed';
            if (status) {
                status.textContent = 'Songs load nahi ho pa rahe.';
                status.classList.remove('hidden');
            }
        }
    }

    function updateCalmNowPlaying(track) {
        const title = document.getElementById('calmTrackTitle');
        const meta = document.getElementById('calmTrackMeta');
        if (title) title.textContent = track ? track.label : 'No track selected';
        if (meta) meta.textContent = track ? `${track.path}${track.sizeLabel ? ` • ${track.sizeLabel}` : ''}` : 'Uploaded tracks yahan se play honge';
    }

    function syncCalmControls() {
        const shuffleBtn = document.getElementById('calmShuffleBtn');
        const repeatBtn = document.getElementById('calmRepeatBtn');
        const volumeSlider = document.getElementById('calmVolumeSlider');
        const speedSelect = document.getElementById('calmSpeedSelect');
        const audio = getCalmAudio();

        if (shuffleBtn) shuffleBtn.classList.toggle('active', calmShuffle);
        if (repeatBtn) {
            repeatBtn.classList.toggle('active', calmRepeatMode !== 0);
            repeatBtn.textContent = calmRepeatMode === 1 ? '🔂' : '🔁';
        }
        if (volumeSlider) volumeSlider.value = String(Math.round(calmVolume * 100));
        updateCalmVolumeIcon(calmVolume);
        if (speedSelect && audio) speedSelect.value = String(audio.playbackRate || 1);
    }

    function setCalmIndex(index) {
        calmCurrentIndex = index;
        renderCalmTracks();
        updateCalmMiniPlayer();
    }

    function playTrackAt(index) {
        const audio = getCalmAudio();
        const track = calmTracks[index];
        if (!audio || !track) return;

        setCalmIndex(index);
        updateCalmNowPlaying(track);
        window.pauseManagedAudioPlayers(['calmAudioPlayer']);
        audio.src = track.src;
        audio.volume = calmVolume;
        audio.playbackRate = Number(document.getElementById('calmSpeedSelect')?.value || 1);
        audio.play().then(() => {
            updateCalmPlaybackVisuals(true);
        }).catch((error) => {
            console.error('CALM play error:', error);
            updateCalmPlaybackVisuals(false);
        });
    }

    function bindCalmAudioEvents() {
        if (calmAudioBound) return;
        const audio = getCalmAudio();
        const seekBar = document.getElementById('calmSeekBar');
        if (!audio) return;
        calmAudioBound = true;

        audio.addEventListener('timeupdate', function () {
            if (calmSeekDragging) return;
            const current = document.getElementById('calmCurrentTime');
            const duration = document.getElementById('calmDuration');
            if (current) current.textContent = formatTime(audio.currentTime);
            if (duration) duration.textContent = formatTime(audio.duration);
            if (seekBar && Number.isFinite(audio.duration) && audio.duration > 0) {
                seekBar.value = String((audio.currentTime / audio.duration) * 100);
            }
        });

        audio.addEventListener('loadedmetadata', function () {
            const duration = document.getElementById('calmDuration');
            if (duration) duration.textContent = formatTime(audio.duration);
        });

        audio.addEventListener('play', function () {
            updateCalmPlaybackVisuals(true);
        });

        audio.addEventListener('pause', function () {
            updateCalmPlaybackVisuals(false);
        });

        audio.addEventListener('ended', function () {
            if (calmRepeatMode === 1) {
                audio.currentTime = 0;
                audio.play().catch(() => { });
                return;
            }
            if (calmRepeatMode === 2 || calmCurrentIndex < calmTracks.length - 1) {
                window.nextCalmTrack();
                return;
            }
            updateCalmPlaybackVisuals(false);
        });

        if (seekBar) {
            seekBar.addEventListener('pointerdown', function () {
                calmSeekDragging = true;
            });
            seekBar.addEventListener('pointerup', function () {
                calmSeekDragging = false;
            });
            seekBar.addEventListener('change', function () {
                calmSeekDragging = false;
            });
        }
    }

    window.playCalmTrack = function (index) {
        if (index < 0 || index >= calmTracks.length) return;
        bindCalmAudioEvents();
        playTrackAt(index);
    };

    window.setCalmSearch = function (value) {
        calmSearchQuery = value || '';
        renderCalmTracks();
    };

    window.clearCalmSearch = function () {
        calmSearchQuery = '';
        const input = document.getElementById('calmSearchInput');
        if (input) input.value = '';
        renderCalmTracks();
    };

    window.toggleCalmPlayPause = function () {
        const audio = getCalmAudio();
        if (!audio) return;
        if (!audio.src) {
            const entries = getCalmFilteredEntries();
            if (entries.length) {
                const selectedEntry = entries.find((entry) => entry.index === calmCurrentIndex) || entries[0];
                window.playCalmTrack(selectedEntry.index);
            }
            return;
        }
        if (audio.paused) {
            audio.play().catch(() => { });
        } else {
            audio.pause();
        }
    };

    window.prevCalmTrack = function () {
        if (!calmTracks.length) return;
        const entries = getCalmFilteredEntries();
        if (!entries.length) return;
        if (calmShuffle && entries.length > 1) {
            let nextIndex = entries[Math.floor(Math.random() * entries.length)].index;
            while (nextIndex === calmCurrentIndex) {
                nextIndex = entries[Math.floor(Math.random() * entries.length)].index;
            }
            playTrackAt(nextIndex);
            return;
        }
        const activePosition = entries.findIndex((entry) => entry.index === calmCurrentIndex);
        const nextEntry = activePosition > 0 ? entries[activePosition - 1] : entries[entries.length - 1];
        playTrackAt(nextEntry.index);
    };

    window.nextCalmTrack = function () {
        if (!calmTracks.length) return;
        const entries = getCalmFilteredEntries();
        if (!entries.length) return;
        if (calmShuffle && entries.length > 1) {
            let nextIndex = entries[Math.floor(Math.random() * entries.length)].index;
            while (nextIndex === calmCurrentIndex) {
                nextIndex = entries[Math.floor(Math.random() * entries.length)].index;
            }
            playTrackAt(nextIndex);
            return;
        }
        const activePosition = entries.findIndex((entry) => entry.index === calmCurrentIndex);
        const nextEntry = activePosition >= 0 && activePosition < entries.length - 1 ? entries[activePosition + 1] : entries[0];
        playTrackAt(nextEntry.index);
    };

    window.toggleCalmShuffle = function () {
        calmShuffle = !calmShuffle;
        syncCalmControls();
    };

    window.toggleCalmRepeat = function () {
        calmRepeatMode = (calmRepeatMode + 1) % 3;
        syncCalmControls();
    };

    window.seekCalmTrack = function (value) {
        const audio = getCalmAudio();
        if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
        const ratio = Math.max(0, Math.min(100, Number(value))) / 100;
        audio.currentTime = audio.duration * ratio;
    };

    window.setCalmVolume = function (value) {
        const audio = getCalmAudio();
        calmVolume = Math.max(0, Math.min(1, Number(value) / 100));
        if (audio) audio.volume = calmVolume;
        if (calmVolume > 0) calmPreviousVolume = calmVolume;
        updateCalmVolumeIcon(calmVolume);
    };

    window.toggleCalmMute = function () {
        const nextVolume = calmVolume > 0 ? 0 : (calmPreviousVolume || 0.8);
        window.setCalmVolume(nextVolume * 100);
        const slider = document.getElementById('calmVolumeSlider');
        if (slider) slider.value = String(Math.round(nextVolume * 100));
    };

    window.setCalmSpeed = function (value) {
        const audio = getCalmAudio();
        if (!audio) return;
        const nextRate = Number(value);
        if (!Number.isFinite(nextRate) || nextRate <= 0) return;
        audio.playbackRate = nextRate;
    };

    window.openCalmPlayer = function () {
        const password = prompt('🔒 Enter Password to open CALM:');
        if (password !== CALM_PASSWORD) {
            if (password !== null) alert('❌ Wrong Password!');
            return;
        }

        const overlay = document.getElementById('calmOverlay');
        const mini = document.getElementById('calmMiniPlayer');
        if (!overlay) return;

        overlay.classList.add('active');
        if (mini) mini.style.display = 'none';
        bindCalmAudioEvents();
        syncCalmControls();

        if (!calmTracks.length) {
            fetchCalmTracks();
        } else {
            renderCalmTracks();
        }
    };

    window.minimizeCalmPlayer = function () {
        const overlay = document.getElementById('calmOverlay');
        const audio = getCalmAudio();
        if (overlay) overlay.classList.remove('active');
        if (audio && !audio.paused) {
            updateCalmMiniPlayer();
        }
    };

    window.maximizeCalmPlayer = function () {
        const overlay = document.getElementById('calmOverlay');
        const mini = document.getElementById('calmMiniPlayer');
        if (overlay) overlay.classList.add('active');
        if (mini) mini.style.display = 'none';
    };

    window.closeCalmPlayer = function () {
        const audio = getCalmAudio();
        const overlay = document.getElementById('calmOverlay');
        if (overlay) overlay.classList.remove('active');
        if (audio && !audio.paused) {
            updateCalmMiniPlayer();
        }
    };

    window.stopCalmPlayback = function () {
        const audio = getCalmAudio();
        const overlay = document.getElementById('calmOverlay');
        const mini = document.getElementById('calmMiniPlayer');
        const seekBar = document.getElementById('calmSeekBar');
        const current = document.getElementById('calmCurrentTime');
        const duration = document.getElementById('calmDuration');

        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audio.removeAttribute('src');
            audio.load();
        }
        if (overlay) overlay.classList.remove('active');
        if (mini) mini.style.display = 'none';
        if (seekBar) seekBar.value = '0';
        if (current) current.textContent = '0:00';
        if (duration) duration.textContent = '0:00';
        calmCurrentIndex = -1;
        updateCalmPlaybackVisuals(false);
        updateCalmNowPlaying(null);
        renderCalmTracks();
    };

    window.refreshCalmTracks = function () {
        const audio = getCalmAudio();
        const seekBar = document.getElementById('calmSeekBar');
        const current = document.getElementById('calmCurrentTime');
        const duration = document.getElementById('calmDuration');
        const mini = document.getElementById('calmMiniPlayer');

        calmTracks = [];
        calmCurrentIndex = -1;
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audio.removeAttribute('src');
            audio.load();
        }
        if (mini) mini.style.display = 'none';
        if (seekBar) seekBar.value = '0';
        if (current) current.textContent = '0:00';
        if (duration) duration.textContent = '0:00';
        updateCalmPlaybackVisuals(false);
        updateCalmNowPlaying(null);
        fetchCalmTracks();
    };

    document.addEventListener('click', function (event) {
        const overlay = document.getElementById('calmOverlay');
        if (event.target === overlay) {
            window.closeCalmPlayer();
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        const volumeSlider = document.getElementById('calmVolumeSlider');
        const speedSelect = document.getElementById('calmSpeedSelect');
        if (volumeSlider) volumeSlider.value = '80';
        if (speedSelect) speedSelect.value = '1';
        updateCalmVolumeIcon(calmVolume);
        syncCalmControls();
        window.makeFloatingMiniPlayerDraggable('calmMiniPlayer', '.calm-mini-info', 'maximizeCalmPlayer');
    });
})();
// #endregion

(function () {
    document.addEventListener('play', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLMediaElement)) return;

        const manager = window.__cvangManagedAudio;
        if (!manager || manager.isSwitching) return;

        const managedIds = manager.ids || [];
        if (managedIds.includes(target.id)) {
            window.pauseManagedAudioPlayers([target.id]);
            return;
        }

        window.pauseManagedAudioPlayers([]);
    }, true);
})();

function openRSAGuidanceModal() {
    const modal = document.getElementById('rsaGuidanceModal');
    if (!modal) return;
    setGuidanceZoom('rsaGuidanceModal', 0.85);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeRSAGuidanceModal() {
    const modal = document.getElementById('rsaGuidanceModal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function openEndorsementGuidanceModal() {
    const modal = document.getElementById('endorsementGuidanceModal');
    if (!modal) return;
    setGuidanceZoom('endorsementGuidanceModal', 0.85);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeEndorsementGuidanceModal() {
    const modal = document.getElementById('endorsementGuidanceModal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function setGuidanceZoom(modalId, zoomValue) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const content = modal.querySelector('.rsa-guidance-content');
    if (!content) return;

    const safeZoom = Math.min(1.6, Math.max(0.6, Number(zoomValue) || 0.85));
    content.style.setProperty('--guidance-zoom', safeZoom.toFixed(2));

    const labelId = modalId === 'rsaGuidanceModal' ? 'rsaGuidanceZoomLabel' : 'endorsementGuidanceZoomLabel';
    const label = document.getElementById(labelId);
    if (label) {
        label.textContent = `${Math.round(safeZoom * 100)}%`;
    }
}

function adjustGuidanceZoom(modalId, direction) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const content = modal.querySelector('.rsa-guidance-content');
    if (!content) return;

    const currentZoom = parseFloat(getComputedStyle(content).getPropertyValue('--guidance-zoom')) || 0.85;
    const nextZoom = currentZoom + (direction * 0.15);
    setGuidanceZoom(modalId, nextZoom);
}

window.openRSAGuidanceModal = openRSAGuidanceModal;
window.closeRSAGuidanceModal = closeRSAGuidanceModal;
window.openEndorsementGuidanceModal = openEndorsementGuidanceModal;
window.closeEndorsementGuidanceModal = closeEndorsementGuidanceModal;
window.adjustGuidanceZoom = adjustGuidanceZoom;

document.addEventListener('click', function (event) {
    const rsaGuidanceModal = document.getElementById('rsaGuidanceModal');
    if (rsaGuidanceModal && event.target === rsaGuidanceModal) {
        closeRSAGuidanceModal();
    }

    const endorsementGuidanceModal = document.getElementById('endorsementGuidanceModal');
    if (endorsementGuidanceModal && event.target === endorsementGuidanceModal) {
        closeEndorsementGuidanceModal();
    }
});

document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        closeRSAGuidanceModal();
        closeEndorsementGuidanceModal();
    }
});

// #region STEALTH BUTTON MODE
(function () {
    const BUTTON_REVEAL_CODE = 'prince';
    const PARTIAL_REVEAL_CODE = 'cvang';
    const typedBuffer = [];

    function revealAllButtons() {
        document.body.classList.remove('stealth-buttons-hidden');
    }

    function revealCvangButtons() {
        document.querySelectorAll('[data-cvang-button="true"]').forEach((button) => {
            button.classList.add('stealth-button-revealed');
        });
    }

    function triggerUploadFromKeyboard() {
        const modal = document.getElementById('tagModal');
        const modalVisible = modal && getComputedStyle(modal).display !== 'none';
        if (modalVisible && typeof window.submitTag === 'function') {
            window.submitTag();
            return true;
        }

        if (typeof window.uploadImage === 'function') {
            window.uploadImage();
            return true;
        }

        return false;
    }

    document.addEventListener('keydown', function (event) {
        if (!document.body) return;

        const key = typeof event.key === 'string' ? event.key : '';
        if (!key) return;

        if (event.ctrlKey && event.shiftKey && key.toLowerCase() === 'u') {
            event.preventDefault();
            triggerUploadFromKeyboard();
            return;
        }

        const normalizedKey = key.toLowerCase();
        if (normalizedKey.length !== 1 || !/[a-z]/.test(normalizedKey)) {
            return;
        }

        typedBuffer.push(normalizedKey);
        const maxCodeLength = Math.max(BUTTON_REVEAL_CODE.length, PARTIAL_REVEAL_CODE.length);
        if (typedBuffer.length > maxCodeLength) {
            typedBuffer.shift();
        }

        if (typedBuffer.join('') === BUTTON_REVEAL_CODE) {
            revealAllButtons();
            typedBuffer.length = 0;
            return;
        }

        if (typedBuffer.join('').endsWith(PARTIAL_REVEAL_CODE)) {
            revealCvangButtons();
            typedBuffer.length = 0;
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        const uploadSection = document.querySelector('.upload-section');
        const tagModal = document.getElementById('tagModal');

        function handleUploadEnter(event) {
            if (event.key !== 'Enter' || event.shiftKey) return;
            if (event.target instanceof HTMLTextAreaElement) return;
            if (event.target instanceof HTMLButtonElement) return;

            event.preventDefault();
            triggerUploadFromKeyboard();
        }

        if (uploadSection) {
            uploadSection.addEventListener('keydown', handleUploadEnter);
        }

        if (tagModal) {
            tagModal.addEventListener('keydown', handleUploadEnter);
        }
    });
})();
// #endregion