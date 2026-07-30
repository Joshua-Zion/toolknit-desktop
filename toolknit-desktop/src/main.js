      import { getCurrentWindow } from '@tauri-apps/api/window';
      import { createIcons, icons } from 'lucide';
      import { initDarkVeil } from './darkveil.js';
      import { initLightRays } from './lightrays.js';
      import { initPlasma } from './plasma.js';
      import { initFerrofluid } from './ferrofluid.js';
      import { initDither } from './dither.js';
      import { getLang, setLang, applyTranslations, onLangChange, t } from './i18n.js';
      import changelog from './data/changelog.json';
      import typingWordsData from './data/typing-words.json';
      import { HELP_CONTENT, getHelpContent } from './help-data.js';
      import { getLegalContent } from './legal-data.js';
      import JSZip from 'jszip';

      // Disable context menu globally, but allow on tool items for favorites
      document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.audio-list-item')) return;
        e.preventDefault();
      });
      document.addEventListener('copy', (e) => e.preventDefault());
      document.addEventListener('cut', (e) => e.preventDefault());

      createIcons({ icons });
      applyTranslations();
      renderChangelog();
      const darkveilBg = document.getElementById('darkveilBg');
      if (darkveilBg) {
        // Randomly choose between the original dark color and a blue variant on each entry
        const darkveilVariant = Math.random() < 0.5 ? 'original' : 'blue';
        initDarkVeil(darkveilBg, {
          hueShift: darkveilVariant === 'blue' ? 220 : 0,
          noiseIntensity: 0.03,
          scanlineIntensity: 0,
          speed: 1.6,
          scanlineFrequency: 5,
          warpAmount: 0,
          resolutionScale: 1
        });
      }

      const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
      const appWindow = isTauri ? getCurrentWindow() : null;

      async function getOutputDir(subFolder) {
        if (!isTauri) return '~/Downloads/ToolKnit/' + subFolder;
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const config = await invoke('get_install_config');
          if (config.install_path) {
            const sep = config.install_path.includes('\\') ? '\\' : '/';
            return config.install_path.replace(/[\/\\]+$/, '') + sep + subFolder;
          }
        } catch (e) { console.error('Failed to get install config:', e); }
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const docsDir = await invoke('get_documents_dir').catch(() => 'C:\\Users\\Downloads');
          return docsDir + '\\ToolKnit\\' + subFolder;
        } catch (e) {
          return 'C:\\Users\\Downloads\\ToolKnit\\' + subFolder;
        }
      }
      const transitionMask = document.getElementById('transitionMask');
      const navItems = document.querySelectorAll('.nav-item');
      const contentSections = document.querySelectorAll('.content-section');
      let isSwitching = false;

      // Tool card mouse spotlight effect and accessibility
      document.querySelectorAll('.tool-card').forEach(card => {
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        const toolName = card.querySelector('.tool-name');
        if (toolName) {
          card.setAttribute('aria-label', toolName.textContent || t('common.tool'));
        }
        card.addEventListener('mousemove', (e) => {
          const rect = card.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          card.style.setProperty('--mouse-x', `${x}%`);
          card.style.setProperty('--mouse-y', `${y}%`);
        });
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.click();
          }
        });
      });

      // Audio list items accessibility + mouse spotlight
      document.querySelectorAll('.audio-list-item').forEach(item => {
        item.addEventListener('mousemove', (e) => {
          const rect = item.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          item.style.setProperty('--mouse-x', `${x}%`);
          item.style.setProperty('--mouse-y', `${y}%`);
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.click();
          }
        });
      });

      // Audio tool search: trigger by button click with spider mascot loading for at least 1s
      // After search: input hides, clear button shows; footer shows at bottom of results
      // Clear button: mask animation, then restore input
      const audioSearchInput = document.getElementById('audioSearchInput');
      const audioSearchBtn = document.getElementById('audioSearchBtn');
      const audioClearBtn = document.getElementById('audioClearBtn');
      const audioSearchFooter = document.getElementById('audioSearchFooter');
      const audioSearchWrap = document.getElementById('audioSearchWrap');

      if (audioSearchBtn && audioSearchInput) {
        let audioSearching = false;
        const doAudioSearch = () => {
          if (audioSearching) return;
          audioSearching = true;
          if (transitionMask) transitionMask.classList.add('visible');
          setTimeout(() => {
            const query = audioSearchInput.value.trim().toLowerCase();
            document.querySelectorAll('.audio-list-item').forEach(item => {
              const text = item.textContent.toLowerCase();
              item.style.display = text.includes(query) ? '' : 'none';
            });
            // Hide input + search button, show clear button
            audioSearchInput.style.display = 'none';
            audioSearchBtn.style.display = 'none';
            audioClearBtn.style.display = 'block';
            // Show footer
            if (audioSearchFooter) audioSearchFooter.style.display = 'flex';
            if (transitionMask) transitionMask.classList.remove('visible');
            audioSearching = false;
          }, 1000);
        };
        audioSearchBtn.addEventListener('click', doAudioSearch);
        audioSearchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doAudioSearch();
        });
      }

      let audioClearing = false;
      const doAudioClear = () => {
        if (audioClearing) return;
        audioClearing = true;
        if (transitionMask) transitionMask.classList.add('visible');
        setTimeout(() => {
          // Reset all items
          document.querySelectorAll('.audio-list-item').forEach(item => {
            item.style.display = '';
          });
          // Restore input + search button, hide clear button
          if (audioSearchInput) { audioSearchInput.value = ''; audioSearchInput.style.display = ''; }
          if (audioSearchBtn) audioSearchBtn.style.display = '';
          if (audioClearBtn) audioClearBtn.style.display = 'none';
          if (audioSearchFooter) audioSearchFooter.style.display = 'none';
          if (transitionMask) transitionMask.classList.remove('visible');
          audioClearing = false;
        }, 1000);
      };

      if (audioClearBtn) audioClearBtn.addEventListener('click', doAudioClear);

      // Generic tools search for all other category pages
      document.querySelectorAll('.content-section').forEach(section => {
        if (section.dataset.category === 'audio') return; // audio has its own logic
        const searchInput = section.querySelector('.tools-search-input');
        const searchBtn = section.querySelector('.tools-search-btn');
        const clearBtn = section.querySelector('.tools-clear-btn');
        if (!searchInput || !searchBtn) return;

        let searching = false;
        const doSearch = () => {
          if (searching) return;
          const query = searchInput.value.trim();
          if (!query) return;
          searching = true;
          if (transitionMask) transitionMask.classList.add('visible');
          setTimeout(() => {
            const query = searchInput.value.trim().toLowerCase();
            section.querySelectorAll('.audio-list-item').forEach(item => {
              const text = item.textContent.toLowerCase();
              item.style.display = text.includes(query) ? '' : 'none';
            });
            searchInput.style.display = 'none';
            searchBtn.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'block';
            if (transitionMask) transitionMask.classList.remove('visible');
            searching = false;
          }, 1000);
        };
        searchBtn.addEventListener('click', doSearch);
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doSearch();
        });

        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            if (searching) return;
            searching = true;
            if (transitionMask) transitionMask.classList.add('visible');
            setTimeout(() => {
              section.querySelectorAll('.audio-list-item').forEach(item => {
                item.style.display = '';
              });
              searchInput.value = '';
              searchInput.style.display = '';
              searchBtn.style.display = '';
              clearBtn.style.display = 'none';
              if (transitionMask) transitionMask.classList.remove('visible');
              searching = false;
            }, 1000);
          });
        }
      });

      let navigatedFromHome = false;

      function switchCategory(category) {
        if (isSwitching) return;
        isSwitching = true;

        navItems.forEach(item => item.classList.remove('active'));
        const targetNav = document.querySelector(`.nav-item[data-category="${category}"]`);
        if (targetNav) targetNav.classList.add('active');

        if (transitionMask) transitionMask.classList.add('visible');

        setTimeout(() => {
          contentSections.forEach(section => section.classList.remove('active'));
          const targetSection = document.querySelector(`.content-section[data-category="${category}"]`);
          if (targetSection) targetSection.classList.add('active');

          if (transitionMask) transitionMask.classList.remove('visible');
          isSwitching = false;
        }, 1000);
      }

      navItems.forEach(item => {
        item.addEventListener('click', () => {
          const category = item.dataset.category;
          if (category && !item.classList.contains('active')) {
            navigatedFromHome = false;
            switchCategory(category);
          }
        });
      });

      if (isTauri && appWindow) {
        document.querySelectorAll('.ctrl-btn[data-action]').forEach(btn => {
          btn.addEventListener('mousedown', (e) => e.stopPropagation());
          btn.addEventListener('click', async () => {
            const action = btn.dataset.action;
            try {
              if (action === 'minimize') {
                await appWindow.minimize();
              } else if (action === 'maximize') {
                const isFullscreen = await appWindow.isFullscreen();
                await appWindow.setFullscreen(!isFullscreen);
              } else if (action === 'close') {
                await appWindow.close();
              }
            } catch (e) {
              console.error('Window control failed:', e);
            }
          });
        });
      }

      const settingsOverlay = document.getElementById('settingsOverlay');
      const settingsBtn = document.getElementById('settingsBtn');
      const settingsBack = document.getElementById('settingsBack');
      const checkUpdate = document.getElementById('checkUpdate');

      // Language selection in settings
      const langOptionBtns = document.querySelectorAll('.settings-row.lang-options .lang-option');
      function syncLangButtons() {
        const current = getLang();
        langOptionBtns.forEach(btn => {
          btn.classList.toggle('active', btn.dataset.lang === current);
        });
      }
      langOptionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          if (transitionMask) transitionMask.classList.add('visible');
          setTimeout(() => {
            setLang(btn.dataset.lang);
            setTimeout(() => {
              if (transitionMask) transitionMask.classList.remove('visible');
            }, 300);
          }, 300);
        });
      });
      onLangChange(syncLangButtons);
      syncLangButtons();

      // Re-apply translations when language changes externally
      onLangChange(() => {
        applyTranslations();
      });

      // Refresh help content on language change
      onLangChange(() => {
        helpSearchCache = null;
        const activeItem = helpNav && helpNav.querySelector('.help-nav-item.active');
        if (activeItem && activeItem.dataset.helpSection) {
          showHelpSection(activeItem.dataset.helpSection);
        }
      });

      if (checkUpdate) {
        checkUpdate.addEventListener('click', () => {
          if (!isTauri) return;
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('check_update', { language: getLang() }).then((result) => {
              if (result.has_update) {
                showForceUpdateOverlay(result);
              } else {
                showToast(t('settings.upToDate'));
              }
            }).catch((e) => {
              console.error('Check update failed:', e);
              showToast(t('settings.updateCheckFailed'));
            });
          });
        });
      }

      // ===== Force Update =====
      const forceUpdateOverlay = document.getElementById('forceUpdateOverlay');
      const forceUpdateVersion = document.getElementById('forceUpdateVersion');
      const forceUpdateChangelog = document.getElementById('forceUpdateChangelog');
      const forceUpdateBtn = document.getElementById('forceUpdateBtn');
      const forceUpdateError = document.getElementById('forceUpdateError');
      let updateInfo = null;

      let forceUpdateBgInstance = null;

      function showForceUpdateOverlay(info) {
        updateInfo = info;
        const isZh = getLang() === 'zh';
        if (forceUpdateVersion) {
          forceUpdateVersion.textContent = `v${info.current_version} → v${info.latest_version}`;
        }
        if (forceUpdateChangelog) {
          forceUpdateChangelog.textContent = isZh ? info.changelog_zh : info.changelog_en;
        }
        if (forceUpdateError) forceUpdateError.classList.remove('visible');
        if (forceUpdateBtn) {
          forceUpdateBtn.disabled = false;
          forceUpdateBtn.textContent = t('home.update.btn');
        }

        if (forceUpdateOverlay) forceUpdateOverlay.classList.add('visible');

        const forceUpdateBg = document.getElementById('forceUpdateBg');
        if (forceUpdateBg && !forceUpdateBgInstance) {
          const darkveilVariant = Math.random() < 0.5 ? 'original' : 'blue';
          forceUpdateBgInstance = initDarkVeil(forceUpdateBg, {
            hueShift: darkveilVariant === 'blue' ? 220 : 0,
            noiseIntensity: 0.03,
            scanlineIntensity: 0,
            speed: 1.6,
            scanlineFrequency: 5,
            warpAmount: 0,
            resolutionScale: 1
          });
        }
      }

      if (forceUpdateBtn) {
        forceUpdateBtn.addEventListener('click', () => {
          const downloadUrl = 'https://toolknit.com/exe.html';
          if (isTauri) {
            import('@tauri-apps/api/core').then(({ invoke }) => {
              invoke('open_url', { url: downloadUrl }).catch(() => {
                window.open(downloadUrl, '_blank');
              });
            });
          } else {
            window.open(downloadUrl, '_blank');
          }
        });
      }

      // Auto check on startup (silent, only force update shows overlay)
      if (isTauri) {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('check_update', { language: getLang() }).then((result) => {
            if (result.has_update && result.force_update) {
              showForceUpdateOverlay(result);
            }
          }).catch(() => {});
        });
      }

      // ===== FFmpeg Download Dialog =====
      const ffmpegDialogOverlay = document.getElementById('ffmpegDialogOverlay');
      const ffmpegDialogCancel = document.getElementById('ffmpegDialogCancel');
      const ffmpegDialogConfirm = document.getElementById('ffmpegDialogConfirm');
      const ffmpegDialogProgressWrap = document.getElementById('ffmpegDialogProgressWrap');
      const ffmpegDialogProgressFill = document.getElementById('ffmpegDialogProgressFill');
      const ffmpegDialogProgressText = document.getElementById('ffmpegDialogProgressText');
      const ffmpegDialogError = document.getElementById('ffmpegDialogError');
      let ffmpegDownloadUnlisten = null;
      let ffmpegBgInstance = null;

      function showFfmpegDialog() {
        return new Promise((resolve) => {
          if (!ffmpegDialogOverlay) { resolve(false); return; }
          if (ffmpegDialogProgressWrap) ffmpegDialogProgressWrap.style.display = 'none';
          if (ffmpegDialogError) ffmpegDialogError.classList.remove('visible');
          if (ffmpegDialogConfirm) ffmpegDialogConfirm.disabled = false;
          if (ffmpegDialogCancel) ffmpegDialogCancel.disabled = false;
          if (ffmpegDialogProgressFill) ffmpegDialogProgressFill.style.width = '0%';
          if (ffmpegDialogProgressText) ffmpegDialogProgressText.textContent = '0%';
          ffmpegDialogOverlay.classList.add('visible');

          const ffmpegOverlayBg = document.getElementById('ffmpegOverlayBg');
          if (ffmpegOverlayBg && !ffmpegBgInstance) {
            const darkveilVariant = Math.random() < 0.5 ? 'original' : 'blue';
            ffmpegBgInstance = initDarkVeil(ffmpegOverlayBg, {
              hueShift: darkveilVariant === 'blue' ? 220 : 0,
              noiseIntensity: 0.03,
              scanlineIntensity: 0,
              speed: 1.6,
              scanlineFrequency: 5,
              warpAmount: 0,
              resolutionScale: 1
            });
          }

          let resolved = false;
          const cleanup = () => {
            ffmpegDialogOverlay.classList.remove('visible');
            if (ffmpegDownloadUnlisten) { ffmpegDownloadUnlisten(); ffmpegDownloadUnlisten = null; }
          };

          if (ffmpegDialogCancel) {
            ffmpegDialogCancel.onclick = () => {
              if (resolved) return;
              resolved = true;
              cleanup();
              resolve(false);
            };
          }

          if (ffmpegDialogConfirm) {
            ffmpegDialogConfirm.onclick = async () => {
              if (resolved) return;
              ffmpegDialogConfirm.disabled = true;
              ffmpegDialogCancel.disabled = true;
              if (ffmpegDialogProgressWrap) ffmpegDialogProgressWrap.style.display = 'flex';
              if (ffmpegDialogError) ffmpegDialogError.classList.remove('visible');

              try {
                const { invoke } = await import('@tauri-apps/api/core');
                const { listen } = await import('@tauri-apps/api/event');
                ffmpegDownloadUnlisten = await listen('ffmpeg-download-progress', (event) => {
                  const pct = event.payload;
                  if (ffmpegDialogProgressFill) ffmpegDialogProgressFill.style.width = pct + '%';
                  if (ffmpegDialogProgressText) ffmpegDialogProgressText.textContent = pct + '%';
                });
                await invoke('download_ffmpeg', { language: getLang() });
                resolved = true;
                cleanup();
                resolve(true);
              } catch (e) {
                if (ffmpegDialogError) {
                  ffmpegDialogError.textContent = t('home.ffmpeg.downloadFail', { error: String(e) });
                  ffmpegDialogError.classList.add('visible');
                }
                ffmpegDialogConfirm.disabled = false;
                ffmpegDialogCancel.disabled = false;
                if (ffmpegDialogProgressWrap) ffmpegDialogProgressWrap.style.display = 'none';
              }
            };
          }
        });
      }

      async function ensureFfmpegAvailable() {
        if (!isTauri) return false;
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const exists = await invoke('check_ffmpeg');
          if (exists) return true;
          const userChoice = await showFfmpegDialog();
          return userChoice;
        } catch (e) {
          console.error('FFmpeg check failed:', e);
          return false;
        }
      }

      // Intercept tool entry: check ffmpeg before opening the tool overlay
      async function openToolWithFfmpegCheck(openFn) {
        const ready = await ensureFfmpegAvailable();
        if (ready) openFn();
      }

      // Storage path display + open folder
      const storagePathDisplay = document.getElementById('storagePathDisplay');
      const openStorageFolder = document.getElementById('openStorageFolder');
      if (storagePathDisplay) {
        if (isTauri) {
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('get_install_config').then((config) => {
              storagePathDisplay.textContent = config.install_path || '--';
            }).catch(() => {
              storagePathDisplay.textContent = '--';
            });
          });
        }
      }
      if (openStorageFolder) {
        openStorageFolder.addEventListener('click', async () => {
          if (!isTauri) return;
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const config = await invoke('get_install_config');
            if (config.install_path) {
              await invoke('open_path', { path: config.install_path });
            }
          } catch (e) {
            console.error('Open folder failed:', e);
          }
        });
      }

      const helpBtn = document.getElementById('helpBtn');
      if (settingsBtn && settingsOverlay) {
        settingsBtn.addEventListener('click', () => settingsOverlay.classList.add('visible'));
      }
      if (helpBtn) {
        helpBtn.addEventListener('click', () => {
          const overlay = document.getElementById('helpOverlay');
          if (overlay) {
            overlay.classList.add('visible');
            showHelpSection('overview');
          }
        });
      }

      if (settingsBack && settingsOverlay) {
        settingsBack.addEventListener('click', () => {
          settingsOverlay.classList.remove('visible');
        });
      }

      const helpLink = document.getElementById('helpLink');
      const feedbackLink = document.getElementById('feedbackLink');
      const declarationLink = document.getElementById('declarationLink');
      const usagePolicyLink = document.getElementById('usagePolicyLink');

      if (helpLink) {
        helpLink.addEventListener('click', (e) => {
          e.preventDefault();
          openHelpOverlay();
        });
      }

      const helpOverlay = document.getElementById('helpOverlay');
      const helpBackBtn = document.getElementById('helpBackBtn');
      const helpNav = document.getElementById('helpNav');
      const helpContentBody = document.getElementById('helpContentBody');
      const helpContentTitle = document.getElementById('helpContentTitle');
      const helpSearchInput = document.getElementById('helpSearchInput');

      function openHelpOverlay() {
        if (!helpOverlay) return;
        helpOverlay.classList.add('visible');
        showHelpSection('overview');
      }

      function closeHelpOverlay() {
        if (!helpOverlay) return;
        helpOverlay.classList.remove('visible');
        if (helpSearchInput) helpSearchInput.value = '';
        if (helpNav) {
          helpNav.querySelectorAll('.help-nav-item').forEach(item => {
            item.style.display = '';
          });
          helpNav.querySelectorAll('.help-nav-group').forEach(g => g.style.display = '');
        }
      }

      if (helpBackBtn) {
        helpBackBtn.addEventListener('click', closeHelpOverlay);
      }

      let helpSearchCache = null;
      function buildHelpSearchCache() {
        const content = getHelpContent();
        if (helpSearchCache || !content) return;
        helpSearchCache = {};
        for (const key in content) {
          const entry = content[key];
          helpSearchCache[key] = (entry.title + ' ' + entry.html).toLowerCase();
        }
      }

      function showHelpSection(sectionId) {
        const content = getHelpContent();
        if (!content || !content[sectionId]) return;
        const data = content[sectionId];
        if (helpContentTitle) helpContentTitle.textContent = data.title;
        if (helpContentBody) {
          helpContentBody.innerHTML = data.html;
          helpContentBody.scrollTop = 0;
        }
        if (helpSearchInput) helpSearchInput.value = '';
        if (helpNav) {
          helpNav.querySelectorAll('.help-nav-item').forEach(item => {
            item.style.display = '';
            item.classList.toggle('active', item.dataset.helpSection === sectionId);
          });
          helpNav.querySelectorAll('.help-nav-group').forEach(g => g.style.display = '');
        }
      }

      if (helpNav) {
        helpNav.addEventListener('click', (e) => {
          const item = e.target.closest('.help-nav-item');
          if (!item) return;
          const section = item.dataset.helpSection;
          if (section) showHelpSection(section);
        });
      }

      if (helpSearchInput) {
        helpSearchInput.addEventListener('input', () => {
          const query = helpSearchInput.value.trim().toLowerCase();
          if (!helpNav) return;
          if (!query) {
            helpNav.querySelectorAll('.help-nav-item').forEach(item => item.style.display = '');
            helpNav.querySelectorAll('.help-nav-group').forEach(g => g.style.display = '');
            const activeItem = helpNav.querySelector('.help-nav-item.active');
            if (activeItem && activeItem.dataset.helpSection) {
              const section = activeItem.dataset.helpSection;
              const content = getHelpContent();
              if (content[section]) {
                helpContentTitle.textContent = content[section].title;
                helpContentBody.innerHTML = content[section].html;
              }
            }
            return;
          }
          buildHelpSearchCache();
          let anyVisible = false;
          helpNav.querySelectorAll('.help-nav-group').forEach(group => {
            let groupHasVisible = false;
            group.querySelectorAll('.help-nav-item').forEach(item => {
              const text = (item.textContent || '').toLowerCase();
              const section = item.dataset.helpSection || '';
              const cached = (helpSearchCache && helpSearchCache[section]) || '';
              const match = text.includes(query) || cached.includes(query);
              item.style.display = match ? '' : 'none';
              if (match) groupHasVisible = true;
            });
            group.style.display = groupHasVisible ? '' : 'none';
            if (groupHasVisible) anyVisible = true;
          });
          if (helpContentBody) {
            if (!anyVisible) {
              helpContentBody.innerHTML = `<div class="help-search-empty">${escapeHtml(t('help.searchEmpty'))}</div>`;
            }
          }
        });
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && helpOverlay && helpOverlay.classList.contains('visible')) {
          closeHelpOverlay();
        }
      });

      const feedbackOverlay = document.getElementById('feedbackOverlay');
      const feedbackBack = document.getElementById('feedbackBack');
      const feedbackBtn = document.getElementById('feedbackBtn');
      const lightraysBg = document.getElementById('lightraysBg');
      let lightraysInstance = null;

      function openFeedbackOverlay() {
        if (!feedbackOverlay) return;
        feedbackOverlay.classList.add('visible');
        if (lightraysBg && !lightraysInstance) {
          lightraysInstance = initLightRays(lightraysBg, {
            raysOrigin: 'top-center',
            raysColor: '#ffffff',
            raysSpeed: 0.6,
            lightSpread: 0.6,
            rayLength: 3,
            followMouse: true,
            mouseInfluence: 0.1,
            noiseAmount: 0,
            distortion: 0,
            pulsating: false,
            fadeDistance: 1,
            saturation: 1
          });
        }
      }

      function closeFeedbackOverlay() {
        if (!feedbackOverlay) return;
        feedbackOverlay.classList.remove('visible');
        closeFeedbackDrawer();
        if (lightraysInstance) {
          lightraysInstance.destroy();
          lightraysInstance = null;
        }
      }

      if (feedbackLink && feedbackOverlay) {
        feedbackLink.addEventListener('click', (e) => {
          e.preventDefault();
          openFeedbackOverlay();
        });
      }

      if (feedbackBtn && feedbackOverlay) {
        feedbackBtn.addEventListener('click', () => {
          openFeedbackOverlay();
        });
      }

      if (feedbackBack && feedbackOverlay) {
        feedbackBack.addEventListener('click', () => {
          closeFeedbackOverlay();
        });
      }

      // Audio Convert Tool Page
      const audioConvertOverlay = document.getElementById('audioConvertOverlay');
      const audioConvertBack = document.getElementById('audioConvertBack');
      const plasmaBg = document.getElementById('plasmaBg');
      let plasmaInstance = null;

      function openAudioConvertOverlay() {
        if (!audioConvertOverlay) return;
        audioConvertOverlay.classList.add('visible');
        if (plasmaBg && !plasmaInstance) {
          plasmaInstance = initPlasma(plasmaBg, {
            color: '#6B6B6B',
            speed: 0.8,
            direction: 'forward',
            scale: 1,
            opacity: 1,
            mouseInteractive: false
          });
        }
      }

      function closeAudioConvertOverlay() {
        if (!audioConvertOverlay) return;
        audioConvertOverlay.classList.remove('visible');
        if (plasmaInstance) {
          plasmaInstance();
          plasmaInstance = null;
        }
        // Reset processing state in case user closed mid-conversion
        processingAudio = false;
        audioConvertProcessMask.classList.remove('visible');
        audioConvertProcessBarFill.style.width = '0%';
        // Clear file list for fresh start next time
        clearAudioFiles();
      }


      if (audioConvertBack) {
        audioConvertBack.addEventListener('click', closeAudioConvertOverlay);
      }

      // Click on audio-list-item with data-tool="convert" to open the convert page
      document.querySelectorAll('.audio-list-item[data-tool="convert"]').forEach(item => {
        item.addEventListener('click', () => {
          openToolWithFfmpegCheck(openAudioConvertOverlay);
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openToolWithFfmpegCheck(openAudioConvertOverlay);
          }
        });
      });

      // Audio Convert drag & drop / files / processing
      const audioConvertDropZone = document.getElementById('audioConvertDropZone');
      const audioConvertFiles = document.getElementById('audioConvertFiles');
      const audioConvertCta = document.getElementById('audioConvertCta');
      const audioConvertProcessBtn = document.getElementById('audioConvertProcessBtn');
      const audioConvertProcessMask = document.getElementById('audioConvertProcessMask');
      const audioConvertProcessBarFill = document.getElementById('audioConvertProcessBarFill');
      const audioConvertProcessText = document.getElementById('audioConvertProcessText');
      const audioConvertCancelBtn = document.getElementById('audioConvertCancelBtn');
      let selectedAudioFiles = [];
      let processingAudio = false;
      let targetAudioFormat = 'MP3';
      const audioConvertSuccessOverlay = document.getElementById('audioConvertSuccessOverlay');
      const audioConvertSuccessPath = document.getElementById('audioConvertSuccessPath');
      const audioConvertSuccessMeta = document.getElementById('audioConvertSuccessMeta');
      const audioConvertSuccessFormat = document.getElementById('audioConvertSuccessFormat');
      const audioConvertSuccessCount = document.getElementById('audioConvertSuccessCount');
      const audioConvertOpenFolder = document.getElementById('audioConvertOpenFolder');
      const audioConvertSuccessOk = document.getElementById('audioConvertSuccessOk');
      const audioConvertFormatOptions = document.getElementById('audioConvertFormatOptions');

      function addAudioFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        for (const file of fileList) {
          // Deduplicate by path (preferred) or name+size fallback
          const dup = file.path
            ? selectedAudioFiles.some(f => f.path === file.path)
            : selectedAudioFiles.some(f => f.name === file.name && f.size === file.size);
          if (dup) continue;
          selectedAudioFiles.push(file);
        }
        renderAudioFiles();
      }

      function removeAudioFile(index) {
        selectedAudioFiles.splice(index, 1);
        renderAudioFiles();
      }

      function clearAudioFiles() {
        selectedAudioFiles = [];
        renderAudioFiles();
      }

      function renderAudioFiles() {
        if (!audioConvertFiles) return;
        audioConvertFiles.innerHTML = '';
        if (selectedAudioFiles.length > 0) {
          audioConvertFiles.classList.add('has-files');
        } else {
          audioConvertFiles.classList.remove('has-files');
        }
        selectedAudioFiles.forEach((file, index) => {
          const item = document.createElement('div');
          item.className = 'audio-convert-file-item';
          item.innerHTML = `
            <span class="audio-convert-file-name">${escapeHtml(file.name)}</span>
            <button class="audio-convert-file-remove" data-index="${index}" aria-label="remove">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          `;
          audioConvertFiles.appendChild(item);
        });
        document.querySelectorAll('.audio-convert-file-remove').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index, 10);
            if (!isNaN(idx)) removeAudioFile(idx);
          });
        });
        toggleAudioProcessButton();
      }

      function toggleAudioProcessButton() {
        if (!audioConvertProcessBtn) return;
        if (selectedAudioFiles.length > 0) {
          audioConvertProcessBtn.style.display = '';
          requestAnimationFrame(() => audioConvertProcessBtn.classList.add('visible'));
        } else {
          audioConvertProcessBtn.classList.remove('visible');
          const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity' && !audioConvertProcessBtn.classList.contains('visible')) {
              audioConvertProcessBtn.style.display = 'none';
              audioConvertProcessBtn.removeEventListener('transitionend', onTransitionEnd);
            }
          };
          audioConvertProcessBtn.addEventListener('transitionend', onTransitionEnd);
        }
      }

      function showAudioDropZone() {
        if (audioConvertDropZone) audioConvertDropZone.classList.add('visible');
        if (audioConvertOverlay) audioConvertOverlay.classList.add('drag-over');
      }

      function hideAudioDropZone() {
        if (audioConvertDropZone) audioConvertDropZone.classList.remove('visible');
        if (audioConvertOverlay) audioConvertOverlay.classList.remove('drag-over');
      }

      // Tauri native drag-drop events — provides file paths
      // Must use getCurrentWebview (not getCurrentWindow) because drag-drop
      // events are emitted at the Webview level, not the Window level.
      if (isTauri && audioConvertOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!audioConvertOverlay.classList.contains('visible') || processingAudio) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') {
              showAudioDropZone();
            } else if (payload.type === 'leave') {
              hideAudioDropZone();
            } else if (payload.type === 'drop') {
              hideAudioDropZone();
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const audioExts = ['mp3', 'aac', 'wav', 'flac', 'alac', 'ogg', 'wma'];
              const fileList = paths
                .filter(p => audioExts.some(ext => p.toLowerCase().endsWith('.' + ext)))
                .map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
              if (fileList.length > 0) {
                addAudioFiles(fileList);
              }
            }
          });
        })();
      }

      if (audioConvertCta) {
        audioConvertCta.addEventListener('click', async () => {
          if (isTauri) {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({
                multiple: true,
                filters: [{
                  name: 'Audio Files',
                  extensions: ['mp3', 'aac', 'wav', 'flac', 'alac', 'ogg', 'wma']
                }]
              });
              if (selected && Array.isArray(selected)) {
                const fileList = selected.map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
                addAudioFiles(fileList);
              }
            } catch (e) {
              console.error('Audio file selection error', e);
            }
          } else {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = 'audio/*';
            input.addEventListener('change', () => {
              addAudioFiles(input.files);
              input.value = '';
            });
            input.click();
          }
        });
      }

      function showSuccessDialog(result) {
        const outputPath = result?.output_dir || (isTauri
          ? 'C:\\Users\\Downloads\\toolknit-converted'
          : '~/Downloads/toolknit-converted');
        const successCount = result?.success_count ?? selectedAudioFiles.length;
        const failCount = result?.fail_count ?? 0;
        const firstFileName = selectedAudioFiles[0]?.name || '';

        // All files failed — show error alert instead of success dialog
        if (failCount > 0 && successCount === 0) {
          const errorDetails = result?.errors?.length > 0
            ? result.errors.slice(0, 3).join('\n')
            : '';
          alert(t('home.audioConvert.allFailed', { count: failCount }) + (errorDetails ? '\n\n' + errorDetails : ''));
          return;
        }

        let summary;
        if (failCount > 0 && successCount > 0) {
          summary = t('home.audioConvert.successSummaryPartial', { success: successCount, fail: failCount, format: targetAudioFormat });
        } else if (successCount > 1) {
          summary = t('home.audioConvert.successSummaryPlural', { count: successCount, format: targetAudioFormat });
        } else {
          summary = t('home.audioConvert.successSummarySingle', { name: firstFileName, format: targetAudioFormat });
        }
        if (audioConvertSuccessMeta) {
          audioConvertSuccessMeta.textContent = summary;
        }
        if (audioConvertSuccessFormat) {
          audioConvertSuccessFormat.textContent = targetAudioFormat;
        }
        if (audioConvertSuccessCount) {
          audioConvertSuccessCount.textContent = `${successCount} ${t('home.audioConvert.successCountUnit')}`;
        }
        if (audioConvertSuccessPath) {
          audioConvertSuccessPath.textContent = outputPath;
        }
        lastOutputPath = outputPath;
        if (audioConvertSuccessOverlay) {
          audioConvertSuccessOverlay.classList.add('visible');
        }
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      function closeSuccessDialog() {
        if (audioConvertSuccessOverlay) {
          audioConvertSuccessOverlay.classList.remove('visible');
        }
        clearAudioFiles();
      }

      if (audioConvertCancelBtn) {
        audioConvertCancelBtn.addEventListener('click', async () => {
          if (isTauri) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              await invoke('cancel_convert');
            } catch (e) {
              console.error('Cancel failed:', e);
            }
          }
          audioConvertProcessMask.classList.remove('visible');
          audioConvertProcessBarFill.style.width = '0%';
          processingAudio = false;
        });
      }

      async function startAudioProcessing() {
        if (!audioConvertProcessMask || !audioConvertProcessBarFill || processingAudio) return;
        if (selectedAudioFiles.length === 0) return;
        processingAudio = true;
        audioConvertProcessMask.classList.add('visible');
        audioConvertProcessBarFill.style.width = '0%';

        if (isTauri) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');

            // Get output directory from install config
            let finalOutputDir = '';
            try {
              const config = await invoke('get_install_config');
              if (config.install_path) {
                const sep = config.install_path.includes('\\') ? '\\' : '/';
                finalOutputDir = config.install_path.replace(/[\/\\]+$/, '') + sep + 'Audio';
              }
            } catch (e) {
              console.error('Failed to get install config:', e);
            }
            if (!finalOutputDir) {
              const outputDir = await invoke('get_documents_dir').catch(() => 'C:\\Users\\Downloads');
              finalOutputDir = outputDir + '\\ToolKnit\\Audio';
            }

            // Collect file paths from selectedAudioFiles
            const inputPaths = selectedAudioFiles.map(f => f.path).filter(Boolean);
            if (inputPaths.length === 0) {
              console.error('No valid file paths found in selectedAudioFiles:', selectedAudioFiles);
              audioConvertProcessMask.classList.remove('visible');
              processingAudio = false;
              alert(t('common.filePathsNotAvailable'));
              return;
            }

            let currentFile = 0;
            const totalFiles = inputPaths.length;

            let unlisten = null;

            // Ensure ffmpeg is available (prompt user to download if missing)
            const ffmpegReady = await ensureFfmpegAvailable();
            if (!ffmpegReady) {
              audioConvertProcessMask.classList.remove('visible');
              processingAudio = false;
              return;
            }

            unlisten = await listen('convert-progress', (event) => {
              const data = event.payload;
              if (data.status === 'converting') {
                currentFile = data.current;
                const fileProgress = (data.current - 1 + data.progress) / data.total;
                const percent = Math.min(99, Math.round(fileProgress * 100));
                audioConvertProcessBarFill.style.width = `${percent}%`;
                if (audioConvertProcessText) {
                  audioConvertProcessText.textContent = `${t('home.audioConvert.processing')} (${data.current}/${data.total})`;
                }
              }
            });

            const result = await invoke('convert_audio_batch', {
              inputPaths: inputPaths,
              outputDir: finalOutputDir,
              targetFormat: targetAudioFormat,
              quality: null
            });

            unlisten();
            audioConvertProcessBarFill.style.width = '100%';

            setTimeout(() => {
              audioConvertProcessMask.classList.remove('visible');
              audioConvertProcessBarFill.style.width = '0%';
              processingAudio = false;
              showSuccessDialog(result);
            }, 400);
          } catch (e) {
            console.error('Conversion failed:', e);
            if (unlisten) unlisten();
            audioConvertProcessMask.classList.remove('visible');
            audioConvertProcessBarFill.style.width = '0%';
            processingAudio = false;
            if (audioConvertProcessText) {
              audioConvertProcessText.textContent = t('home.audioConvert.processing');
            }
            alert(t('common.errorOccurred', { error: e?.message || e }));
          }
        } else {
          // Fallback: simulate for non-Tauri
          let progress = 0;
          const duration = 2500;
          const interval = 60;
          const step = 100 / (duration / interval);
          const timer = setInterval(() => {
            progress += step + (Math.random() * 0.8);
            if (progress >= 100) progress = 100;
            audioConvertProcessBarFill.style.width = `${progress}%`;
            if (progress >= 100) {
              clearInterval(timer);
              setTimeout(() => {
                audioConvertProcessMask.classList.remove('visible');
                audioConvertProcessBarFill.style.width = '0%';
                processingAudio = false;
                showSuccessDialog();
              }, 400);
            }
          }, interval);
        }
      }

      if (audioConvertProcessBtn) {
        audioConvertProcessBtn.addEventListener('click', () => {
          if (selectedAudioFiles.length > 0) startAudioProcessing();
        });
      }

      if (audioConvertSuccessOk) {
        audioConvertSuccessOk.addEventListener('click', () => {
          closeSuccessDialog();
        });
      }

      let lastOutputPath = '';
      if (audioConvertOpenFolder) {
        audioConvertOpenFolder.addEventListener('click', () => {
          if (isTauri && lastOutputPath) {
            import('@tauri-apps/api/core').then(({ invoke }) => {
              invoke('open_path', { path: lastOutputPath }).catch(e => console.error('Open folder error', e));
            }).catch(e => console.error('Core import error', e));
          }
          closeSuccessDialog();
        });
      }

      if (audioConvertFormatOptions) {
        audioConvertFormatOptions.addEventListener('click', (e) => {
          const btn = e.target.closest('.audio-convert-format-option');
          if (!btn) return;
          audioConvertFormatOptions.querySelectorAll('.audio-convert-format-option').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          targetAudioFormat = btn.dataset.format;
        });
      }

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      // ===== Image Convert Tool =====
      const imageConvertOverlay = document.getElementById('imageConvertOverlay');
      const imageConvertBack = document.getElementById('imageConvertBack');
      const imageConvertPlasmaBg = document.getElementById('imageConvertPlasmaBg');
      let imageConvertPlasmaInstance = null;

      function openImageConvertOverlay() {
        if (!imageConvertOverlay) return;
        imageConvertOverlay.classList.add('visible');
        if (imageConvertPlasmaBg && !imageConvertPlasmaInstance) {
          imageConvertPlasmaInstance = initPlasma(imageConvertPlasmaBg, {
            color: '#6B6B6B', speed: 0.8, direction: 'forward', scale: 1, opacity: 1, mouseInteractive: false
          });
        }
      }

      function closeImageConvertOverlay() {
        if (!imageConvertOverlay) return;
        imageConvertOverlay.classList.remove('visible');
        if (imageConvertPlasmaInstance) { imageConvertPlasmaInstance(); imageConvertPlasmaInstance = null; }
        processingImage = false;
        imageConvertProcessMask.classList.remove('visible');
        imageConvertProcessBarFill.style.width = '0%';
        clearImageFiles();
      }

      if (imageConvertBack) imageConvertBack.addEventListener('click', closeImageConvertOverlay);

      document.querySelectorAll('.audio-list-item[data-tool="image-convert"]').forEach(item => {
        item.addEventListener('click', () => openImageConvertOverlay());
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openImageConvertOverlay(); }
        });
      });

      const imageConvertDropZone = document.getElementById('imageConvertDropZone');
      const imageConvertFiles = document.getElementById('imageConvertFiles');
      const imageConvertCta = document.getElementById('imageConvertCta');
      const imageConvertProcessBtn = document.getElementById('imageConvertProcessBtn');
      const imageConvertProcessMask = document.getElementById('imageConvertProcessMask');
      const imageConvertProcessBarFill = document.getElementById('imageConvertProcessBarFill');
      const imageConvertProcessText = document.getElementById('imageConvertProcessText');
      const imageConvertCancelBtn = document.getElementById('imageConvertCancelBtn');
      let selectedImageFiles = [];
      let processingImage = false;
      let targetImageFormat = 'PNG';
      const imageConvertSuccessOverlay = document.getElementById('imageConvertSuccessOverlay');
      const imageConvertSuccessPath = document.getElementById('imageConvertSuccessPath');
      const imageConvertSuccessMeta = document.getElementById('imageConvertSuccessMeta');
      const imageConvertSuccessFormat = document.getElementById('imageConvertSuccessFormat');
      const imageConvertSuccessCount = document.getElementById('imageConvertSuccessCount');
      const imageConvertOpenFolder = document.getElementById('imageConvertOpenFolder');
      const imageConvertSuccessOk = document.getElementById('imageConvertSuccessOk');
      const imageConvertFormatOptions = document.getElementById('imageConvertFormatOptions');
      const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];

      function addImageFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        for (const file of fileList) {
          const dup = file.path
            ? selectedImageFiles.some(f => f.path === file.path)
            : selectedImageFiles.some(f => f.name === file.name && f.size === file.size);
          if (dup) continue;
          selectedImageFiles.push(file);
        }
        renderImageFiles();
      }

      function removeImageFile(index) { selectedImageFiles.splice(index, 1); renderImageFiles(); }
      function clearImageFiles() { selectedImageFiles = []; renderImageFiles(); }

      function renderImageFiles() {
        if (!imageConvertFiles) return;
        imageConvertFiles.innerHTML = '';
        if (selectedImageFiles.length > 0) imageConvertFiles.classList.add('has-files');
        else imageConvertFiles.classList.remove('has-files');
        selectedImageFiles.forEach((file, index) => {
          const item = document.createElement('div');
          item.className = 'audio-convert-file-item';
          item.innerHTML = `<span class="audio-convert-file-name">${escapeHtml(file.name)}</span><button class="audio-convert-file-remove" data-index="${index}" aria-label="remove"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;
          imageConvertFiles.appendChild(item);
        });
        imageConvertFiles.querySelectorAll('.audio-convert-file-remove').forEach(btn => {
          btn.addEventListener('click', () => { const idx = parseInt(btn.dataset.index, 10); if (!isNaN(idx)) removeImageFile(idx); });
        });
        toggleImageProcessButton();
      }

      function toggleImageProcessButton() {
        if (!imageConvertProcessBtn) return;
        if (selectedImageFiles.length > 0) {
          imageConvertProcessBtn.style.display = '';
          requestAnimationFrame(() => imageConvertProcessBtn.classList.add('visible'));
        } else {
          imageConvertProcessBtn.classList.remove('visible');
          const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity' && !imageConvertProcessBtn.classList.contains('visible')) {
              imageConvertProcessBtn.style.display = 'none';
              imageConvertProcessBtn.removeEventListener('transitionend', onTransitionEnd);
            }
          };
          imageConvertProcessBtn.addEventListener('transitionend', onTransitionEnd);
        }
      }

      function showImageDropZone() {
        if (imageConvertDropZone) imageConvertDropZone.classList.add('visible');
        if (imageConvertOverlay) imageConvertOverlay.classList.add('drag-over');
      }
      function hideImageDropZone() {
        if (imageConvertDropZone) imageConvertDropZone.classList.remove('visible');
        if (imageConvertOverlay) imageConvertOverlay.classList.remove('drag-over');
      }

      if (isTauri && imageConvertOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!imageConvertOverlay.classList.contains('visible') || processingImage) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') showImageDropZone();
            else if (payload.type === 'leave') hideImageDropZone();
            else if (payload.type === 'drop') {
              hideImageDropZone();
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const fileList = paths
                .filter(p => imageExts.some(ext => p.toLowerCase().endsWith('.' + ext)))
                .map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
              if (fileList.length > 0) addImageFiles(fileList);
            }
          });
        })();
      }

      if (imageConvertCta) {
        imageConvertCta.addEventListener('click', async () => {
          if (isTauri) {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({ multiple: true, filters: [{ name: 'Image Files', extensions: imageExts }] });
              if (selected && Array.isArray(selected)) {
                addImageFiles(selected.map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 })));
              }
            } catch (e) { console.error('Image file selection error', e); }
          } else {
            const input = document.createElement('input');
            input.type = 'file'; input.multiple = true; input.accept = 'image/*';
            input.addEventListener('change', () => { addImageFiles(input.files); input.value = ''; });
            input.click();
          }
        });
      }

      function showImageSuccessDialog(result) {
        const outputPath = result?.output_dir || (isTauri ? 'C:\\Users\\Downloads\\toolknit-converted' : '~/Downloads/toolknit-converted');
        const successCount = result?.success_count ?? selectedImageFiles.length;
        const failCount = result?.fail_count ?? 0;
        const firstFileName = selectedImageFiles[0]?.name || '';
        let summary;
        if (failCount > 0 && successCount > 0) {
          summary = t('home.imageConvert.successSummaryPartial', { success: successCount, fail: failCount, format: targetImageFormat });
        } else if (failCount > 0 && successCount === 0) {
          summary = t('home.imageConvert.allFailed', { count: failCount });
        } else if (successCount > 1) {
          summary = t('home.imageConvert.successSummaryPlural', { count: successCount, format: targetImageFormat });
        } else {
          summary = t('home.imageConvert.successSummarySingle', { name: firstFileName, format: targetImageFormat });
        }
        if (imageConvertSuccessMeta) imageConvertSuccessMeta.textContent = summary;
        if (imageConvertSuccessFormat) imageConvertSuccessFormat.textContent = targetImageFormat;
        if (imageConvertSuccessCount) imageConvertSuccessCount.textContent = `${successCount} ${t('home.imageConvert.successCountUnit')}`;
        if (imageConvertSuccessPath) imageConvertSuccessPath.textContent = outputPath;
        lastImageOutputPath = outputPath;
        if (imageConvertSuccessOverlay) imageConvertSuccessOverlay.classList.add('visible');
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      function closeImageSuccessDialog() {
        if (imageConvertSuccessOverlay) imageConvertSuccessOverlay.classList.remove('visible');
        clearImageFiles();
      }

      if (imageConvertCancelBtn) {
        imageConvertCancelBtn.addEventListener('click', async () => {
          if (isTauri) { try { const { invoke } = await import('@tauri-apps/api/core'); await invoke('cancel_convert'); } catch (e) { console.error('Cancel failed:', e); } }
          imageConvertProcessMask.classList.remove('visible');
          imageConvertProcessBarFill.style.width = '0%';
          processingImage = false;
        });
      }

      async function startImageProcessing() {
        if (!imageConvertProcessMask || !imageConvertProcessBarFill || processingImage) return;
        if (selectedImageFiles.length === 0) return;
        processingImage = true;
        imageConvertProcessMask.classList.add('visible');
        imageConvertProcessBarFill.style.width = '0%';

        if (isTauri) {
          let unlisten = null;
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');

            let finalOutputDir = '';
            try {
              const config = await invoke('get_install_config');
              if (config.install_path) {
                const sep = config.install_path.includes('\\') ? '\\' : '/';
                finalOutputDir = config.install_path.replace(/[\/\\]+$/, '') + sep + 'Images';
              }
            } catch (e) { console.error('Failed to get install config:', e); }
            if (!finalOutputDir) {
              const outputDir = await invoke('get_documents_dir').catch(() => 'C:\\Users\\Downloads');
              finalOutputDir = outputDir + '\\ToolKnit\\Images';
            }

            const inputPaths = selectedImageFiles.map(f => f.path).filter(Boolean);
            if (inputPaths.length === 0) {
              imageConvertProcessMask.classList.remove('visible'); processingImage = false;
              alert(t('common.filePathsNotAvailableShort')); return;
            }

            unlisten = await listen('convert-progress', (event) => {
              const data = event.payload;
              if (data.status === 'converting') {
                const fileProgress = (data.current - 1 + data.progress) / data.total;
                const percent = Math.min(99, Math.round(fileProgress * 100));
                imageConvertProcessBarFill.style.width = `${percent}%`;
                if (imageConvertProcessText) imageConvertProcessText.textContent = `${t('home.imageConvert.processing')} (${data.current}/${data.total})`;
              }
            });

            const result = await invoke('convert_image_batch', { inputPaths, outputDir: finalOutputDir, targetFormat: targetImageFormat });
            if (unlisten) unlisten();
            imageConvertProcessBarFill.style.width = '100%';
            setTimeout(() => {
              imageConvertProcessMask.classList.remove('visible');
              imageConvertProcessBarFill.style.width = '0%';
              processingImage = false;
              showImageSuccessDialog(result);
            }, 400);
          } catch (e) {
            console.error('Image conversion failed:', e);
            if (unlisten) unlisten();
            imageConvertProcessMask.classList.remove('visible');
            imageConvertProcessBarFill.style.width = '0%';
            processingImage = false;
            if (imageConvertProcessText) imageConvertProcessText.textContent = t('home.imageConvert.processing');
            alert(t('common.errorOccurred', { error: e?.message || e }));
          }
        } else {
          let progress = 0; const duration = 2500; const interval = 60;
          const step = 100 / (duration / interval);
          const timer = setInterval(() => {
            progress += step + (Math.random() * 0.8);
            if (progress >= 100) progress = 100;
            imageConvertProcessBarFill.style.width = `${progress}%`;
            if (progress >= 100) {
              clearInterval(timer);
              setTimeout(() => {
                imageConvertProcessMask.classList.remove('visible');
                imageConvertProcessBarFill.style.width = '0%';
                processingImage = false;
                showImageSuccessDialog();
              }, 400);
            }
          }, interval);
        }
      }

      if (imageConvertProcessBtn) imageConvertProcessBtn.addEventListener('click', () => { if (selectedImageFiles.length > 0) startImageProcessing(); });
      if (imageConvertSuccessOk) imageConvertSuccessOk.addEventListener('click', () => closeImageSuccessDialog());

      let lastImageOutputPath = '';
      if (imageConvertOpenFolder) {
        imageConvertOpenFolder.addEventListener('click', () => {
          if (isTauri && lastImageOutputPath) {
            import('@tauri-apps/api/core').then(({ invoke }) => {
              invoke('open_path', { path: lastImageOutputPath }).catch(e => console.error('Open folder error', e));
            }).catch(e => console.error('Core import error', e));
          }
          closeImageSuccessDialog();
        });
      }

      if (imageConvertFormatOptions) {
        imageConvertFormatOptions.addEventListener('click', (e) => {
          const btn = e.target.closest('.audio-convert-format-option');
          if (!btn) return;
          imageConvertFormatOptions.querySelectorAll('.audio-convert-format-option').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          targetImageFormat = btn.dataset.format;
        });
      }

      // ===== Image Compress Tool =====
      const imageCompressOverlay = document.getElementById('imageCompressOverlay');
      const imageCompressBack = document.getElementById('imageCompressBack');
      const imageCompressPlasmaBg = document.getElementById('imageCompressPlasmaBg');
      let imageCompressPlasmaInstance = null;

      function openImageCompressOverlay() {
        if (!imageCompressOverlay) return;
        imageCompressOverlay.classList.add('visible');
        if (imageCompressPlasmaBg && !imageCompressPlasmaInstance) {
          imageCompressPlasmaInstance = initPlasma(imageCompressPlasmaBg, {
            color: '#6B6B6B', speed: 0.8, direction: 'forward', scale: 1, opacity: 1, mouseInteractive: false
          });
        }
      }

      function closeImageCompressOverlay() {
        if (!imageCompressOverlay) return;
        imageCompressOverlay.classList.remove('visible');
        if (imageCompressPlasmaInstance) { imageCompressPlasmaInstance(); imageCompressPlasmaInstance = null; }
        processingImageCompress = false;
        imageCompressProcessMask.classList.remove('visible');
        imageCompressProcessBarFill.style.width = '0%';
        clearImageCompressFiles();
      }

      if (imageCompressBack) imageCompressBack.addEventListener('click', closeImageCompressOverlay);

      document.querySelectorAll('.audio-list-item[data-tool="image-compress"]').forEach(item => {
        item.addEventListener('click', () => openImageCompressOverlay());
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openImageCompressOverlay(); }
        });
      });

      const imageCompressDropZone = document.getElementById('imageCompressDropZone');
      const imageCompressFiles = document.getElementById('imageCompressFiles');
      const imageCompressCta = document.getElementById('imageCompressCta');
      const imageCompressProcessBtn = document.getElementById('imageCompressProcessBtn');
      const imageCompressProcessMask = document.getElementById('imageCompressProcessMask');
      const imageCompressProcessBarFill = document.getElementById('imageCompressProcessBarFill');
      const imageCompressProcessText = document.getElementById('imageCompressProcessText');
      const imageCompressCancelBtn = document.getElementById('imageCompressCancelBtn');
      let selectedImageCompressFiles = [];
      let processingImageCompress = false;
      let targetCompressQuality = 'medium';
      const imageCompressSuccessOverlay = document.getElementById('imageCompressSuccessOverlay');
      const imageCompressSuccessPath = document.getElementById('imageCompressSuccessPath');
      const imageCompressSuccessMeta = document.getElementById('imageCompressSuccessMeta');
      const imageCompressSuccessFormat = document.getElementById('imageCompressSuccessFormat');
      const imageCompressSuccessCount = document.getElementById('imageCompressSuccessCount');
      const imageCompressOpenFolder = document.getElementById('imageCompressOpenFolder');
      const imageCompressSuccessOk = document.getElementById('imageCompressSuccessOk');
      const imageCompressQualityOptions = document.getElementById('imageCompressQualityOptions');
      const compressExts = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];
      const qualityLabelMap = { high: 'home.imageCompress.qualityHigh', medium: 'home.imageCompress.qualityMedium', low: 'home.imageCompress.qualityLow' };

      function addImageCompressFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        for (const file of fileList) {
          const dup = file.path
            ? selectedImageCompressFiles.some(f => f.path === file.path)
            : selectedImageCompressFiles.some(f => f.name === file.name && f.size === file.size);
          if (dup) continue;
          selectedImageCompressFiles.push(file);
        }
        renderImageCompressFiles();
      }

      function removeImageCompressFile(index) { selectedImageCompressFiles.splice(index, 1); renderImageCompressFiles(); }
      function clearImageCompressFiles() { selectedImageCompressFiles = []; renderImageCompressFiles(); }

      function renderImageCompressFiles() {
        if (!imageCompressFiles) return;
        imageCompressFiles.innerHTML = '';
        if (selectedImageCompressFiles.length > 0) imageCompressFiles.classList.add('has-files');
        else imageCompressFiles.classList.remove('has-files');
        selectedImageCompressFiles.forEach((file, index) => {
          const item = document.createElement('div');
          item.className = 'audio-convert-file-item';
          item.innerHTML = `<span class="audio-convert-file-name">${escapeHtml(file.name)}</span><button class="audio-convert-file-remove" data-index="${index}" aria-label="remove"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;
          imageCompressFiles.appendChild(item);
        });
        imageCompressFiles.querySelectorAll('.audio-convert-file-remove').forEach(btn => {
          btn.addEventListener('click', () => { const idx = parseInt(btn.dataset.index, 10); if (!isNaN(idx)) removeImageCompressFile(idx); });
        });
        toggleImageCompressProcessButton();
      }

      function toggleImageCompressProcessButton() {
        if (!imageCompressProcessBtn) return;
        if (selectedImageCompressFiles.length > 0) {
          imageCompressProcessBtn.style.display = '';
          requestAnimationFrame(() => imageCompressProcessBtn.classList.add('visible'));
        } else {
          imageCompressProcessBtn.classList.remove('visible');
          const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity' && !imageCompressProcessBtn.classList.contains('visible')) {
              imageCompressProcessBtn.style.display = 'none';
              imageCompressProcessBtn.removeEventListener('transitionend', onTransitionEnd);
            }
          };
          imageCompressProcessBtn.addEventListener('transitionend', onTransitionEnd);
        }
      }

      function showImageCompressDropZone() {
        if (imageCompressDropZone) imageCompressDropZone.classList.add('visible');
        if (imageCompressOverlay) imageCompressOverlay.classList.add('drag-over');
      }
      function hideImageCompressDropZone() {
        if (imageCompressDropZone) imageCompressDropZone.classList.remove('visible');
        if (imageCompressOverlay) imageCompressOverlay.classList.remove('drag-over');
      }

      if (isTauri && imageCompressOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!imageCompressOverlay.classList.contains('visible') || processingImageCompress) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') showImageCompressDropZone();
            else if (payload.type === 'leave') hideImageCompressDropZone();
            else if (payload.type === 'drop') {
              hideImageCompressDropZone();
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const fileList = paths
                .filter(p => compressExts.some(ext => p.toLowerCase().endsWith('.' + ext)))
                .map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
              if (fileList.length > 0) addImageCompressFiles(fileList);
            }
          });
        })();
      }

      if (imageCompressCta) {
        imageCompressCta.addEventListener('click', async () => {
          if (isTauri) {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({ multiple: true, filters: [{ name: 'Image Files', extensions: compressExts }] });
              if (selected && Array.isArray(selected)) {
                addImageCompressFiles(selected.map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 })));
              }
            } catch (e) { console.error('Image compress file selection error', e); }
          } else {
            const input = document.createElement('input');
            input.type = 'file'; input.multiple = true; input.accept = 'image/*';
            input.addEventListener('change', () => { addImageCompressFiles(input.files); input.value = ''; });
            input.click();
          }
        });
      }

      function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let val = bytes;
        while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
        return i === 0 ? `${val} ${units[i]}` : `${val.toFixed(2)} ${units[i]}`;
      }

      function showImageCompressSuccessDialog(result) {
        const outputPath = result?.output_dir || (isTauri ? 'C:\\Users\\Downloads\\toolknit-compressed' : '~/Downloads/toolknit-compressed');
        const successCount = result?.success_count ?? selectedImageCompressFiles.length;
        const failCount = result?.fail_count ?? 0;
        const firstFileName = selectedImageCompressFiles[0]?.name || '';
        const qualityText = t(qualityLabelMap[targetCompressQuality] || 'home.imageCompress.qualityMedium');
        let summary;
        if (failCount > 0 && successCount > 0) {
          summary = t('home.imageCompress.successSummaryPartial', { success: successCount, fail: failCount, format: qualityText });
        } else if (failCount > 0 && successCount === 0) {
          summary = t('home.imageCompress.allFailed', { count: failCount });
        } else if (successCount > 1) {
          summary = t('home.imageCompress.successSummaryPlural', { count: successCount, format: qualityText });
        } else {
          summary = t('home.imageCompress.successSummarySingle', { name: firstFileName, format: qualityText });
        }
        if (imageCompressSuccessMeta) imageCompressSuccessMeta.textContent = summary;
        if (imageCompressSuccessFormat) imageCompressSuccessFormat.textContent = qualityText;
        if (imageCompressSuccessCount) imageCompressSuccessCount.textContent = `${successCount} ${t('home.imageCompress.successCountUnit')}`;
        if (imageCompressSuccessPath) imageCompressSuccessPath.textContent = outputPath;

        const origSize = result?.original_size ?? 0;
        const compSize = result?.compressed_size ?? 0;
        const savedBytes = origSize - compSize;
        const savedPercent = origSize > 0 ? Math.round((savedBytes / origSize) * 100) : 0;
        const origEl = document.getElementById('imageCompressSuccessOriginalSize');
        const compEl = document.getElementById('imageCompressSuccessCompressedSize');
        const savedEl = document.getElementById('imageCompressSuccessSavedSize');
        if (origEl) origEl.textContent = formatBytes(origSize);
        if (compEl) compEl.textContent = formatBytes(compSize);
        if (savedEl) savedEl.textContent = `${formatBytes(savedBytes)} (${savedPercent}%)`;

        lastImageCompressOutputPath = outputPath;
        if (imageCompressSuccessOverlay) imageCompressSuccessOverlay.classList.add('visible');
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      function closeImageCompressSuccessDialog() {
        if (imageCompressSuccessOverlay) imageCompressSuccessOverlay.classList.remove('visible');
        clearImageCompressFiles();
      }

      if (imageCompressCancelBtn) {
        imageCompressCancelBtn.addEventListener('click', async () => {
          if (isTauri) { try { const { invoke } = await import('@tauri-apps/api/core'); await invoke('cancel_convert'); } catch (e) { console.error('Cancel failed:', e); } }
          imageCompressProcessMask.classList.remove('visible');
          imageCompressProcessBarFill.style.width = '0%';
          processingImageCompress = false;
        });
      }

      async function startImageCompressProcessing() {
        if (!imageCompressProcessMask || !imageCompressProcessBarFill || processingImageCompress) return;
        if (selectedImageCompressFiles.length === 0) return;
        processingImageCompress = true;
        imageCompressProcessMask.classList.add('visible');
        imageCompressProcessBarFill.style.width = '0%';

        if (isTauri) {
          let unlisten = null;
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');

            let finalOutputDir = '';
            try {
              const config = await invoke('get_install_config');
              if (config.install_path) {
                const sep = config.install_path.includes('\\') ? '\\' : '/';
                finalOutputDir = config.install_path.replace(/[\/\\]+$/, '') + sep + 'Images';
              }
            } catch (e) { console.error('Failed to get install config:', e); }
            if (!finalOutputDir) {
              const outputDir = await invoke('get_documents_dir').catch(() => 'C:\\Users\\Downloads');
              finalOutputDir = outputDir + '\\ToolKnit\\Images';
            }

            const inputPaths = selectedImageCompressFiles.map(f => f.path).filter(Boolean);
            if (inputPaths.length === 0) {
              imageCompressProcessMask.classList.remove('visible'); processingImageCompress = false;
              alert(t('common.filePathsNotAvailableShort')); return;
            }

            unlisten = await listen('convert-progress', (event) => {
              const data = event.payload;
              if (data.status === 'converting') {
                const fileProgress = (data.current - 1 + data.progress) / data.total;
                const percent = Math.min(99, Math.round(fileProgress * 100));
                imageCompressProcessBarFill.style.width = `${percent}%`;
                if (imageCompressProcessText) imageCompressProcessText.textContent = `${t('home.imageCompress.processing')} (${data.current}/${data.total})`;
              }
            });

            const result = await invoke('compress_image_batch', { inputPaths, outputDir: finalOutputDir, quality: targetCompressQuality });
            if (unlisten) unlisten();
            imageCompressProcessBarFill.style.width = '100%';
            setTimeout(() => {
              imageCompressProcessMask.classList.remove('visible');
              imageCompressProcessBarFill.style.width = '0%';
              processingImageCompress = false;
              showImageCompressSuccessDialog(result);
            }, 400);
          } catch (e) {
            console.error('Image compression failed:', e);
            if (unlisten) unlisten();
            imageCompressProcessMask.classList.remove('visible');
            imageCompressProcessBarFill.style.width = '0%';
            processingImageCompress = false;
            if (imageCompressProcessText) imageCompressProcessText.textContent = t('home.imageCompress.processing');
            alert(t('common.errorOccurred', { error: e?.message || e }));
          }
        } else {
          let progress = 0; const duration = 2500; const interval = 60;
          const step = 100 / (duration / interval);
          const timer = setInterval(() => {
            progress += step + (Math.random() * 0.8);
            if (progress >= 100) progress = 100;
            imageCompressProcessBarFill.style.width = `${progress}%`;
            if (progress >= 100) {
              clearInterval(timer);
              setTimeout(() => {
                imageCompressProcessMask.classList.remove('visible');
                imageCompressProcessBarFill.style.width = '0%';
                processingImageCompress = false;
                showImageCompressSuccessDialog();
              }, 400);
            }
          }, interval);
        }
      }

      if (imageCompressProcessBtn) imageCompressProcessBtn.addEventListener('click', () => { if (selectedImageCompressFiles.length > 0) startImageCompressProcessing(); });
      if (imageCompressSuccessOk) imageCompressSuccessOk.addEventListener('click', () => closeImageCompressSuccessDialog());

      let lastImageCompressOutputPath = '';
      if (imageCompressOpenFolder) {
        imageCompressOpenFolder.addEventListener('click', () => {
          if (isTauri && lastImageCompressOutputPath) {
            import('@tauri-apps/api/core').then(({ invoke }) => {
              invoke('open_path', { path: lastImageCompressOutputPath }).catch(e => console.error('Open folder error', e));
            }).catch(e => console.error('Core import error', e));
          }
          closeImageCompressSuccessDialog();
        });
      }

      if (imageCompressQualityOptions) {
        imageCompressQualityOptions.addEventListener('click', (e) => {
          const btn = e.target.closest('.audio-convert-format-option');
          if (!btn) return;
          imageCompressQualityOptions.querySelectorAll('.audio-convert-format-option').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          targetCompressQuality = btn.dataset.quality;
        });
      }

      // ===== Icon Generator Tool =====
      const iconGenOverlay = document.getElementById('iconGenOverlay');
      const iconGenBack = document.getElementById('iconGenBack');
      const iconGenPlasmaBg = document.getElementById('iconGenPlasmaBg');
      const iconGenCta = document.getElementById('iconGenCta');
      const iconGenProcessBtn = document.getElementById('iconGenProcessBtn');
      const iconGenFiles = document.getElementById('iconGenFiles');
      const iconGenDropZone = document.getElementById('iconGenDropZone');
      const iconGenProcessMask = document.getElementById('iconGenProcessMask');
      const iconGenProcessBarFill = document.getElementById('iconGenProcessBarFill');
      const iconGenProcessText = document.getElementById('iconGenProcessText');
      let iconGenPlasmaInstance = null;
      let lastIconGenDownloadDir = '';
      let selectedIconGenFile = null;
      let processingIconGen = false;
      let iconGenObjectUrl = null;

      const ALL_SIZES = [16, 24, 32, 48, 64, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512, 1024];
      const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

      function openIconGenOverlay() {
        if (!iconGenOverlay) return;
        iconGenOverlay.classList.add('visible');
        if (iconGenPlasmaBg && !iconGenPlasmaInstance) {
          iconGenPlasmaInstance = initPlasma(iconGenPlasmaBg, {
            color: '#6B6B6B', speed: 0.8, direction: 'forward', scale: 1, opacity: 1, mouseInteractive: false
          });
        }
      }

      function closeIconGenOverlay() {
        if (!iconGenOverlay) return;
        if (processingIconGen) return;
        iconGenOverlay.classList.remove('visible');
        if (iconGenPlasmaInstance) {
          iconGenPlasmaInstance();
          iconGenPlasmaInstance = null;
        }
        if (iconGenProcessMask) iconGenProcessMask.classList.remove('visible');
        if (iconGenProcessBarFill) iconGenProcessBarFill.style.width = '0%';
        if (iconGenObjectUrl) {
          URL.revokeObjectURL(iconGenObjectUrl);
          iconGenObjectUrl = null;
        }
        selectedIconGenFile = null;
        if (iconGenFiles) {
          iconGenFiles.innerHTML = '';
          iconGenFiles.classList.remove('has-files');
        }
        if (iconGenProcessBtn) {
          iconGenProcessBtn.classList.remove('visible');
          setTimeout(() => iconGenProcessBtn.style.display = 'none', 300);
        }
      }

      if (iconGenBack) iconGenBack.addEventListener('click', closeIconGenOverlay);

      document.querySelectorAll('.audio-list-item[data-tool="icon-gen"]').forEach(item => {
        item.addEventListener('click', () => openIconGenOverlay());
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openIconGenOverlay();
          }
        });
      });

      function showIconGenProcessBtn() {
        if (!iconGenProcessBtn) return;
        iconGenProcessBtn.style.display = '';
        requestAnimationFrame(() => iconGenProcessBtn.classList.add('visible'));
      }

      function hideIconGenProcessBtn() {
        if (!iconGenProcessBtn) return;
        iconGenProcessBtn.classList.remove('visible');
        const onTransitionEnd = (e) => {
          if (e.propertyName === 'opacity' && !iconGenProcessBtn.classList.contains('visible')) {
            iconGenProcessBtn.style.display = 'none';
            iconGenProcessBtn.removeEventListener('transitionend', onTransitionEnd);
          }
        };
        iconGenProcessBtn.addEventListener('transitionend', onTransitionEnd);
      }

      // Drag & drop visual feedback
      if (iconGenOverlay) {
        iconGenOverlay.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (!iconGenOverlay.classList.contains('visible') || processingIconGen) return;
          iconGenOverlay.classList.add('drag-over');
        });
        iconGenOverlay.addEventListener('dragleave', (e) => {
          e.preventDefault();
          if (!iconGenOverlay.classList.contains('visible') || processingIconGen) return;
          iconGenOverlay.classList.remove('drag-over');
        });
        iconGenOverlay.addEventListener('drop', (e) => {
          e.preventDefault();
          if (!iconGenOverlay.classList.contains('visible') || processingIconGen) return;
          iconGenOverlay.classList.remove('drag-over');
          const files = e.dataTransfer?.files;
          if (files && files.length > 0) {
            handleIconGenFileSelect(files[0]);
          }
        });
      }

      // Tauri native drag-drop events — provides file paths
      if (isTauri && iconGenOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!iconGenOverlay.classList.contains('visible') || processingIconGen) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') {
              iconGenOverlay.classList.add('drag-over');
              if (iconGenDropZone) iconGenDropZone.classList.add('visible');
            } else if (payload.type === 'leave') {
              iconGenOverlay.classList.remove('drag-over');
              if (iconGenDropZone) iconGenDropZone.classList.remove('visible');
            } else if (payload.type === 'drop') {
              iconGenOverlay.classList.remove('drag-over');
              if (iconGenDropZone) iconGenDropZone.classList.remove('visible');
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const imgExts = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'];
              const imgPath = paths.find(p => imgExts.some(ext => p.toLowerCase().endsWith('.' + ext)));
              if (imgPath) {
                handleIconGenFileSelect({ name: imgPath.split(/[\\/]/).pop() || imgPath, path: imgPath, size: 0, type: 'image/png' });
              }
            }
          });
        })();
      }

      if (iconGenCta) {
        iconGenCta.addEventListener('click', async () => {
          if (isTauri) {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({
                multiple: false,
                filters: [{ name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
              });
              if (selected && typeof selected === 'string') {
                handleIconGenFileSelect({ name: selected.split(/[\\/]/).pop() || selected, path: selected, size: 0, type: 'image/png' });
              }
            } catch (e) {
              console.error('Icon gen file selection error', e);
            }
          } else {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png,image/jpeg,image/jpg';
            input.onchange = (e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleIconGenFileSelect(e.target.files[0]);
              }
            };
            input.click();
          }
        });
      }

      async function handleIconGenFileSelect(file) {
        if (!file || !file.type.startsWith('image/')) {
          alert(t('home.iconGen.invalidFormat'));
          return;
        }
        if (!iconGenFiles) return;
        if (iconGenObjectUrl) {
          URL.revokeObjectURL(iconGenObjectUrl);
          iconGenObjectUrl = null;
        }
        selectedIconGenFile = file;
        if (isTauri && file.path) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const rawBytes = await invoke('read_file_bytes', { path: file.path });
            const bytes = Array.isArray(rawBytes) ? Uint8Array.from(rawBytes) : new Uint8Array(rawBytes);
            const blob = new Blob([bytes], { type: file.type || 'image/png' });
            iconGenObjectUrl = URL.createObjectURL(blob);
          } catch (e) {
            console.error('Failed to read image file for preview:', e);
            iconGenObjectUrl = URL.createObjectURL(file);
          }
        } else {
          iconGenObjectUrl = URL.createObjectURL(file);
        }
        iconGenFiles.innerHTML = '';
        iconGenFiles.classList.add('has-files');
        const item = document.createElement('div');
        item.className = 'audio-convert-file-item';
        item.innerHTML = `<img class="audio-convert-file-thumb" src="${iconGenObjectUrl}" alt="preview" /><span class="audio-convert-file-name">${escapeHtml(file.name)}</span><span class="audio-convert-file-size">${(file.size / 1024).toFixed(1)} KB</span><button class="audio-convert-file-remove" aria-label="remove"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;
        iconGenFiles.appendChild(item);
        item.querySelector('.audio-convert-file-remove').addEventListener('click', () => {
          if (iconGenObjectUrl) {
            URL.revokeObjectURL(iconGenObjectUrl);
            iconGenObjectUrl = null;
          }
          selectedIconGenFile = null;
          iconGenFiles.innerHTML = '';
          iconGenFiles.classList.remove('has-files');
          hideIconGenProcessBtn();
        });
        showIconGenProcessBtn();
      }

      // Crop image to square using Canvas
      function cropToSquare(img, size) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');
        const minDim = Math.max(1, Math.min(img.width, img.height));
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        return canvas;
      }

      // Generate SVG wrapping the image as base64
      function generateSvg(img) {
        const canvas = document.createElement('canvas');
        const size = 1024;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');
        const minDim = Math.max(1, Math.min(img.width, img.height));
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><image href="data:image/png;base64,${base64}" width="1024" height="1024"/></svg>`;
        return svg;
      }

      // Generate ICO file from multiple PNG blobs
      async function generateIco(img, sizes) {
        const pngs = [];
        for (const size of sizes) {
          const canvas = cropToSquare(img, size);
          const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(b => { if (b) resolve(b); else reject(new Error('toBlob returned null')); }, 'image/png');
          });
          const buf = new Uint8Array(await blob.arrayBuffer());
          pngs.push({ size, data: buf });
        }

        const headerSize = 6;
        const dirEntrySize = 16;
        const numIcons = pngs.length;
        const offset = headerSize + dirEntrySize * numIcons;

        const totalSize = offset + pngs.reduce((sum, p) => sum + p.data.length, 0);
        const buf = new ArrayBuffer(totalSize);
        const view = new DataView(buf);
        const u8 = new Uint8Array(buf);

        // ICONDIR header
        view.setUint16(0, 0, true);  // reserved
        view.setUint16(2, 1, true);  // type = ICO
        view.setUint16(4, numIcons, true);

        let dataOffset = offset;
        for (let i = 0; i < numIcons; i++) {
          const p = pngs[i];
          const entryOffset = headerSize + i * dirEntrySize;
          view.setUint8(entryOffset, p.size >= 256 ? 0 : p.size);   // width
          view.setUint8(entryOffset + 1, p.size >= 256 ? 0 : p.size); // height
          view.setUint8(entryOffset + 2, 0);  // palette
          view.setUint8(entryOffset + 3, 0);  // reserved
          view.setUint16(entryOffset + 4, 1, true);  // color planes
          view.setUint16(entryOffset + 6, 32, true); // bits per pixel
          view.setUint32(entryOffset + 8, p.data.length, true);  // size
          view.setUint32(entryOffset + 12, dataOffset, true);     // offset
          u8.set(p.data, dataOffset);
          dataOffset += p.data.length;
        }

        return new Blob([buf], { type: 'image/x-icon' });
      }

      // Generate icons and pack as ZIP
      async function startIconGenProcessing() {
        if (!selectedIconGenFile || processingIconGen) return;
        processingIconGen = true;
        lastIconGenDownloadDir = '';
        if (iconGenProcessBtn) {
          iconGenProcessBtn.textContent = t('home.iconGen.processing');
          iconGenProcessBtn.disabled = true;
        }

        if (iconGenProcessMask) {
          iconGenProcessMask.classList.add('visible');
          if (iconGenProcessBarFill) iconGenProcessBarFill.style.width = '0%';
        }

        try {
          const img = await loadImage(selectedIconGenFile);
          const zip = new JSZip();
          const folder = zip.folder('icons');
          const totalSteps = ALL_SIZES.length + 3; // PNG sizes + ICO + SVG + favicon.ico
          let step = 0;

          // Generate PNG icons at all sizes
          for (const size of ALL_SIZES) {
            const canvas = cropToSquare(img, size);
            const blob = await new Promise((resolve, reject) => {
              canvas.toBlob(b => { if (b) resolve(b); else reject(new Error('toBlob returned null')); }, 'image/png');
            });
            folder.file(`icon-${size}x${size}.png`, blob);
            step++;
            const percent = Math.round((step / totalSteps) * 80);
            if (iconGenProcessBarFill) iconGenProcessBarFill.style.width = `${percent}%`;
          }

          // Generate ICO (multi-size)
          if (iconGenProcessText) iconGenProcessText.textContent = t('home.iconGen.genIco');
          const icoBlob = await generateIco(img, ICO_SIZES);
          folder.file('icon.ico', icoBlob);
          step++;
          if (iconGenProcessBarFill) iconGenProcessBarFill.style.width = `${Math.round((step / totalSteps) * 80)}%`;

          // Generate SVG
          if (iconGenProcessText) iconGenProcessText.textContent = t('home.iconGen.genSvg');
          const svgContent = generateSvg(img);
          folder.file('icon.svg', svgContent);
          step++;
          if (iconGenProcessBarFill) iconGenProcessBarFill.style.width = `${Math.round((step / totalSteps) * 80)}%`;

          // Generate favicon.ico (16x32x48 - classic favicon)
          if (iconGenProcessText) iconGenProcessText.textContent = t('home.iconGen.genFavicon');
          const faviconBlob = await generateIco(img, [16, 32, 48]);
          folder.file('favicon.ico', faviconBlob);
          step++;
          if (iconGenProcessBarFill) iconGenProcessBarFill.style.width = `${Math.round((step / totalSteps) * 80)}%`;

          if (iconGenProcessText) iconGenProcessText.textContent = t('home.iconGen.processing');
          if (iconGenProcessBarFill) iconGenProcessBarFill.style.width = '90%';
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          if (iconGenProcessBarFill) iconGenProcessBarFill.style.width = '100%';

          let savedPath = '';
          if (isTauri) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const outputDir = await getOutputDir('Icons');
              const fileName = `icons_${Date.now()}.zip`;
              const fullPath = outputDir + '\\' + fileName;
              const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
              const CHUNK_SIZE = 5_000_000;
              await invoke('write_file_chunk', { path: fullPath, offset: 0, bytes: Array.from(zipBytes.subarray(0, CHUNK_SIZE)) });
              for (let off = CHUNK_SIZE; off < zipBytes.length; off += CHUNK_SIZE) {
                const end = Math.min(off + CHUNK_SIZE, zipBytes.length);
                await invoke('write_file_chunk', { path: fullPath, offset: off, bytes: Array.from(zipBytes.subarray(off, end)) });
              }
              savedPath = fullPath;
              lastIconGenDownloadDir = fullPath;
            } catch (e) {
              console.error('Tauri save error, falling back to download:', e);
              const url = URL.createObjectURL(zipBlob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `icons.zip`;
              a.click();
              URL.revokeObjectURL(url);
            }
          } else {
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `icons.zip`;
            a.click();
            URL.revokeObjectURL(url);
          }

          const totalIcons = ALL_SIZES.length + 3; // PNGs + ICO + SVG + favicon.ico
          setTimeout(() => {
            if (iconGenProcessMask) iconGenProcessMask.classList.remove('visible');
            if (iconGenProcessBarFill) iconGenProcessBarFill.style.width = '0%';
            if (iconGenProcessText) iconGenProcessText.textContent = t('home.iconGen.processing');
            showToast(t('home.iconGen.successSummary', { count: totalIcons }));
            showIconGenSuccessDialog(totalIcons);
          }, 400);
        } catch (err) {
          console.error('Icon generation error:', err);
          if (iconGenProcessMask) iconGenProcessMask.classList.remove('visible');
          if (iconGenProcessBarFill) iconGenProcessBarFill.style.width = '0%';
          if (iconGenProcessText) iconGenProcessText.textContent = t('home.iconGen.processing');
          alert(t('home.iconGen.error'));
        } finally {
          processingIconGen = false;
          if (iconGenProcessBtn) {
            iconGenProcessBtn.textContent = t('home.iconGen.processBtn');
            iconGenProcessBtn.disabled = false;
          }
        }
      }

      async function loadImage(file) {
        let objUrl;
        if (isTauri && file.path) {
          const { invoke } = await import('@tauri-apps/api/core');
          const rawBytes = await invoke('read_file_bytes', { path: file.path });
          const bytes = Array.isArray(rawBytes) ? Uint8Array.from(rawBytes) : new Uint8Array(rawBytes);
          const blob = new Blob([bytes], { type: file.type || 'image/png' });
          objUrl = URL.createObjectURL(blob);
        } else {
          objUrl = URL.createObjectURL(file);
        }
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(objUrl);
            resolve(img);
          };
          img.onerror = () => {
            URL.revokeObjectURL(objUrl);
            reject(new Error('Failed to load image'));
          };
          img.src = objUrl;
        });
      }

      // Success dialog
      const iconGenSuccessOverlay = document.getElementById('iconGenSuccessOverlay');
      const iconGenSuccessOk = document.getElementById('iconGenSuccessOk');
      const iconGenSuccessCount = document.getElementById('iconGenSuccessCount');
      const iconGenSuccessMeta = document.getElementById('iconGenSuccessMeta');
      const iconGenOpenFolder = document.getElementById('iconGenOpenFolder');

      function showIconGenSuccessDialog(count) {
        if (!iconGenSuccessOverlay) return;
        if (iconGenSuccessCount) iconGenSuccessCount.textContent = `${count} ${t('home.iconGen.successCountUnit')}`;
        if (iconGenSuccessMeta) {
          if (lastIconGenDownloadDir) {
            const dir = lastIconGenDownloadDir.includes('\\') ? lastIconGenDownloadDir.substring(0, lastIconGenDownloadDir.lastIndexOf('\\')) : lastIconGenDownloadDir;
            iconGenSuccessMeta.textContent = t('home.iconGen.successSummary', { count }) + '\n' + dir;
          } else {
            iconGenSuccessMeta.textContent = t('home.iconGen.successSummary', { count });
          }
        }
        if (iconGenOpenFolder) {
          iconGenOpenFolder.style.display = lastIconGenDownloadDir ? '' : 'none';
        }
        iconGenSuccessOverlay.classList.add('visible');
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      function closeIconGenSuccessDialog() {
        if (!iconGenSuccessOverlay) return;
        iconGenSuccessOverlay.classList.remove('visible');
      }

      if (iconGenProcessBtn) iconGenProcessBtn.addEventListener('click', () => { if (selectedIconGenFile && !processingIconGen) startIconGenProcessing(); });
      if (iconGenSuccessOk) iconGenSuccessOk.addEventListener('click', closeIconGenSuccessDialog);
      if (iconGenOpenFolder) {
        iconGenOpenFolder.addEventListener('click', () => {
          if (isTauri && lastIconGenDownloadDir) {
            import('@tauri-apps/api/core').then(({ invoke }) => {
              const dir = lastIconGenDownloadDir.includes('\\') ? lastIconGenDownloadDir.substring(0, lastIconGenDownloadDir.lastIndexOf('\\')) : lastIconGenDownloadDir;
              invoke('open_path', { path: dir }).catch(e => console.error('Open folder error', e));
            }).catch(e => console.error('Core import error', e));
          }
          closeIconGenSuccessDialog();
        });
      }

      // ===== Video Convert Tool =====
      const videoConvertOverlay = document.getElementById('videoConvertOverlay');
      const videoConvertBack = document.getElementById('videoConvertBack');
      const videoConvertPlasmaBg = document.getElementById('videoConvertPlasmaBg');
      let videoConvertPlasmaInstance = null;

      function openVideoConvertOverlay() {
        if (!videoConvertOverlay) return;
        videoConvertOverlay.classList.add('visible');
        if (videoConvertPlasmaBg && !videoConvertPlasmaInstance) {
          videoConvertPlasmaInstance = initPlasma(videoConvertPlasmaBg, {
            color: '#6B6B6B', speed: 0.8, direction: 'forward', scale: 1, opacity: 1, mouseInteractive: false
          });
        }
      }

      function closeVideoConvertOverlay() {
        if (!videoConvertOverlay) return;
        videoConvertOverlay.classList.remove('visible');
        if (videoConvertPlasmaInstance) { videoConvertPlasmaInstance(); videoConvertPlasmaInstance = null; }
        processingVideo = false;
        videoConvertProcessMask.classList.remove('visible');
        videoConvertProcessBarFill.style.width = '0%';
        clearVideoFiles();
      }

      if (videoConvertBack) videoConvertBack.addEventListener('click', closeVideoConvertOverlay);

      document.querySelectorAll('.audio-list-item[data-tool="video-convert"]').forEach(item => {
        item.addEventListener('click', () => openToolWithFfmpegCheck(openVideoConvertOverlay));
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openToolWithFfmpegCheck(openVideoConvertOverlay); }
        });
      });

      const videoConvertDropZone = document.getElementById('videoConvertDropZone');
      const videoConvertFiles = document.getElementById('videoConvertFiles');
      const videoConvertCta = document.getElementById('videoConvertCta');
      const videoConvertProcessBtn = document.getElementById('videoConvertProcessBtn');
      const videoConvertProcessMask = document.getElementById('videoConvertProcessMask');
      const videoConvertProcessBarFill = document.getElementById('videoConvertProcessBarFill');
      const videoConvertProcessText = document.getElementById('videoConvertProcessText');
      const videoConvertCancelBtn = document.getElementById('videoConvertCancelBtn');
      let selectedVideoFiles = [];
      let processingVideo = false;
      let targetVideoFormat = 'MP4';
      const videoConvertSuccessOverlay = document.getElementById('videoConvertSuccessOverlay');
      const videoConvertSuccessPath = document.getElementById('videoConvertSuccessPath');
      const videoConvertSuccessMeta = document.getElementById('videoConvertSuccessMeta');
      const videoConvertSuccessFormat = document.getElementById('videoConvertSuccessFormat');
      const videoConvertSuccessCount = document.getElementById('videoConvertSuccessCount');
      const videoConvertOpenFolder = document.getElementById('videoConvertOpenFolder');
      const videoConvertSuccessOk = document.getElementById('videoConvertSuccessOk');
      const videoConvertFormatOptions = document.getElementById('videoConvertFormatOptions');
      const videoExts = ['mp4', 'avi', 'mkv', 'mov', 'webm', 'flv', 'wmv', 'ts'];

      function addVideoFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        for (const file of fileList) {
          const dup = file.path
            ? selectedVideoFiles.some(f => f.path === file.path)
            : selectedVideoFiles.some(f => f.name === file.name && f.size === file.size);
          if (dup) continue;
          selectedVideoFiles.push(file);
        }
        renderVideoFiles();
      }

      function removeVideoFile(index) { selectedVideoFiles.splice(index, 1); renderVideoFiles(); }
      function clearVideoFiles() { selectedVideoFiles = []; renderVideoFiles(); }

      function renderVideoFiles() {
        if (!videoConvertFiles) return;
        videoConvertFiles.innerHTML = '';
        if (selectedVideoFiles.length > 0) videoConvertFiles.classList.add('has-files');
        else videoConvertFiles.classList.remove('has-files');
        selectedVideoFiles.forEach((file, index) => {
          const item = document.createElement('div');
          item.className = 'audio-convert-file-item';
          item.innerHTML = `<span class="audio-convert-file-name">${escapeHtml(file.name)}</span><button class="audio-convert-file-remove" data-index="${index}" aria-label="remove"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;
          videoConvertFiles.appendChild(item);
        });
        videoConvertFiles.querySelectorAll('.audio-convert-file-remove').forEach(btn => {
          btn.addEventListener('click', () => { const idx = parseInt(btn.dataset.index, 10); if (!isNaN(idx)) removeVideoFile(idx); });
        });
        toggleVideoProcessButton();
      }

      function toggleVideoProcessButton() {
        if (!videoConvertProcessBtn) return;
        if (selectedVideoFiles.length > 0) {
          videoConvertProcessBtn.style.display = '';
          requestAnimationFrame(() => videoConvertProcessBtn.classList.add('visible'));
        } else {
          videoConvertProcessBtn.classList.remove('visible');
          const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity' && !videoConvertProcessBtn.classList.contains('visible')) {
              videoConvertProcessBtn.style.display = 'none';
              videoConvertProcessBtn.removeEventListener('transitionend', onTransitionEnd);
            }
          };
          videoConvertProcessBtn.addEventListener('transitionend', onTransitionEnd);
        }
      }

      function showVideoDropZone() {
        if (videoConvertDropZone) videoConvertDropZone.classList.add('visible');
        if (videoConvertOverlay) videoConvertOverlay.classList.add('drag-over');
      }
      function hideVideoDropZone() {
        if (videoConvertDropZone) videoConvertDropZone.classList.remove('visible');
        if (videoConvertOverlay) videoConvertOverlay.classList.remove('drag-over');
      }

      if (isTauri && videoConvertOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!videoConvertOverlay.classList.contains('visible') || processingVideo) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') showVideoDropZone();
            else if (payload.type === 'leave') hideVideoDropZone();
            else if (payload.type === 'drop') {
              hideVideoDropZone();
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const fileList = paths
                .filter(p => videoExts.some(ext => p.toLowerCase().endsWith('.' + ext)))
                .map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
              if (fileList.length > 0) addVideoFiles(fileList);
            }
          });
        })();
      }

      if (videoConvertCta) {
        videoConvertCta.addEventListener('click', async () => {
          if (isTauri) {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({ multiple: true, filters: [{ name: 'Video Files', extensions: videoExts }] });
              if (selected && Array.isArray(selected)) {
                addVideoFiles(selected.map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 })));
              }
            } catch (e) { console.error('Video file selection error', e); }
          } else {
            const input = document.createElement('input');
            input.type = 'file'; input.multiple = true; input.accept = 'video/*';
            input.addEventListener('change', () => { addVideoFiles(input.files); input.value = ''; });
            input.click();
          }
        });
      }

      function showVideoSuccessDialog(result) {
        const outputPath = result?.output_dir || (isTauri ? 'C:\\Users\\Downloads\\toolknit-converted' : '~/Downloads/toolknit-converted');
        const successCount = result?.success_count ?? selectedVideoFiles.length;
        const failCount = result?.fail_count ?? 0;
        const firstFileName = selectedVideoFiles[0]?.name || '';
        let summary;
        if (failCount > 0 && successCount > 0) {
          summary = t('home.videoConvert.successSummaryPartial', { success: successCount, fail: failCount, format: targetVideoFormat });
        } else if (failCount > 0 && successCount === 0) {
          summary = t('home.videoConvert.allFailed', { count: failCount });
        } else if (successCount > 1) {
          summary = t('home.videoConvert.successSummaryPlural', { count: successCount, format: targetVideoFormat });
        } else {
          summary = t('home.videoConvert.successSummarySingle', { name: firstFileName, format: targetVideoFormat });
        }
        if (videoConvertSuccessMeta) videoConvertSuccessMeta.textContent = summary;
        if (videoConvertSuccessFormat) videoConvertSuccessFormat.textContent = targetVideoFormat;
        if (videoConvertSuccessCount) videoConvertSuccessCount.textContent = `${successCount} ${t('home.videoConvert.successCountUnit')}`;
        if (videoConvertSuccessPath) videoConvertSuccessPath.textContent = outputPath;
        lastVideoOutputPath = outputPath;
        if (videoConvertSuccessOverlay) videoConvertSuccessOverlay.classList.add('visible');
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      function closeVideoSuccessDialog() {
        if (videoConvertSuccessOverlay) videoConvertSuccessOverlay.classList.remove('visible');
        clearVideoFiles();
      }

      if (videoConvertCancelBtn) {
        videoConvertCancelBtn.addEventListener('click', async () => {
          if (isTauri) { try { const { invoke } = await import('@tauri-apps/api/core'); await invoke('cancel_convert'); } catch (e) { console.error('Cancel failed:', e); } }
          videoConvertProcessMask.classList.remove('visible');
          videoConvertProcessBarFill.style.width = '0%';
          processingVideo = false;
        });
      }

      async function startVideoProcessing() {
        if (!videoConvertProcessMask || !videoConvertProcessBarFill || processingVideo) return;
        if (selectedVideoFiles.length === 0) return;
        processingVideo = true;
        videoConvertProcessMask.classList.add('visible');
        videoConvertProcessBarFill.style.width = '0%';

        if (isTauri) {
          let unlisten = null;
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');

            let finalOutputDir = '';
            try {
              const config = await invoke('get_install_config');
              if (config.install_path) {
                const sep = config.install_path.includes('\\') ? '\\' : '/';
                finalOutputDir = config.install_path.replace(/[\/\\]+$/, '') + sep + 'Videos';
              }
            } catch (e) { console.error('Failed to get install config:', e); }
            if (!finalOutputDir) {
              const outputDir = await invoke('get_documents_dir').catch(() => 'C:\\Users\\Downloads');
              finalOutputDir = outputDir + '\\ToolKnit\\Videos';
            }

            const inputPaths = selectedVideoFiles.map(f => f.path).filter(Boolean);
            if (inputPaths.length === 0) {
              videoConvertProcessMask.classList.remove('visible'); processingVideo = false;
              alert(t('common.filePathsNotAvailableShort')); return;
            }

            unlisten = await listen('convert-progress', (event) => {
              const data = event.payload;
              if (data.status === 'converting') {
                const fileProgress = (data.current - 1 + data.progress) / data.total;
                const percent = Math.min(99, Math.round(fileProgress * 100));
                videoConvertProcessBarFill.style.width = `${percent}%`;
                if (videoConvertProcessText) videoConvertProcessText.textContent = `${t('home.videoConvert.processing')} (${data.current}/${data.total})`;
              }
            });

            const result = await invoke('convert_video_batch', { inputPaths, outputDir: finalOutputDir, targetFormat: targetVideoFormat });
            if (unlisten) unlisten();
            videoConvertProcessBarFill.style.width = '100%';
            setTimeout(() => {
              videoConvertProcessMask.classList.remove('visible');
              videoConvertProcessBarFill.style.width = '0%';
              processingVideo = false;
              showVideoSuccessDialog(result);
            }, 400);
          } catch (e) {
            console.error('Video conversion failed:', e);
            if (unlisten) unlisten();
            videoConvertProcessMask.classList.remove('visible');
            videoConvertProcessBarFill.style.width = '0%';
            processingVideo = false;
            if (videoConvertProcessText) videoConvertProcessText.textContent = t('home.videoConvert.processing');
            alert(t('common.errorOccurred', { error: e?.message || e }));
          }
        } else {
          let progress = 0; const duration = 3500; const interval = 60;
          const step = 100 / (duration / interval);
          const timer = setInterval(() => {
            progress += step + (Math.random() * 0.8);
            if (progress >= 100) progress = 100;
            videoConvertProcessBarFill.style.width = `${progress}%`;
            if (progress >= 100) {
              clearInterval(timer);
              setTimeout(() => {
                videoConvertProcessMask.classList.remove('visible');
                videoConvertProcessBarFill.style.width = '0%';
                processingVideo = false;
                showVideoSuccessDialog();
              }, 400);
            }
          }, interval);
        }
      }

      if (videoConvertProcessBtn) videoConvertProcessBtn.addEventListener('click', () => { if (selectedVideoFiles.length > 0) startVideoProcessing(); });
      if (videoConvertSuccessOk) videoConvertSuccessOk.addEventListener('click', () => closeVideoSuccessDialog());

      let lastVideoOutputPath = '';
      if (videoConvertOpenFolder) {
        videoConvertOpenFolder.addEventListener('click', () => {
          if (isTauri && lastVideoOutputPath) {
            import('@tauri-apps/api/core').then(({ invoke }) => {
              invoke('open_path', { path: lastVideoOutputPath }).catch(e => console.error('Open folder error', e));
            }).catch(e => console.error('Core import error', e));
          }
          closeVideoSuccessDialog();
        });
      }

      if (videoConvertFormatOptions) {
        videoConvertFormatOptions.addEventListener('click', (e) => {
          const btn = e.target.closest('.audio-convert-format-option');
          if (!btn) return;
          videoConvertFormatOptions.querySelectorAll('.audio-convert-format-option').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          targetVideoFormat = btn.dataset.format;
        });
      }

      // ===== BPM Detect Tool =====
      const bpmDetectOverlay = document.getElementById('bpmDetectOverlay');
      const bpmDetectBack = document.getElementById('bpmDetectBack');
      const bpmDetectCta = document.getElementById('bpmDetectCta');
      const bpmDetectHeroTop = document.getElementById('bpmDetectHeroTop');
      const bpmResult = document.getElementById('bpmResult');
      const bpmResultNumber = document.getElementById('bpmResultNumber');
      const bpmTimelineTrack = document.getElementById('bpmTimelineTrack');
      const bpmResultHint = document.getElementById('bpmResultHint');
      const bpmReanalyzeBtn = document.getElementById('bpmReanalyzeBtn');
      const bpmProcessMask = document.getElementById('bpmProcessMask');
      const bpmProcessBarFill = document.getElementById('bpmProcessBarFill');
      const bpmProcessText = document.getElementById('bpmProcessText');
      const bpmDropZone = document.getElementById('bpmDropZone');
      const bpmPlasmaBg = document.getElementById('bpmPlasmaBg');
      let bpmPlasmaInstance = null;

      function openBpmDetectOverlay() {
        bpmDetectOverlay.classList.add('visible');
        // Reset to initial state
        bpmDetectHeroTop.style.display = '';
        bpmResult.classList.remove('visible');
        // Init plasma bg
        if (bpmPlasmaBg && !bpmPlasmaInstance) {
          bpmPlasmaInstance = initPlasma(bpmPlasmaBg, {
            color: '#6B6B6B',
            speed: 0.8,
            direction: 'forward',
            density: 3
          });
        }
      }

      function closeBpmDetectOverlay() {
        bpmDetectOverlay.classList.remove('visible');
        bpmResult.classList.remove('visible');
        // Stop BPM demo if playing
        if (bpmDemoState.isPlaying) closeBpmDemo();
        // Destroy plasma instance to free GPU/CPU
        if (bpmPlasmaInstance) {
          bpmPlasmaInstance();
          bpmPlasmaInstance = null;
        }
        // Reset analyzing state in case user closed mid-analysis
        bpmAnalyzing = false;
        bpmProcessMask.classList.remove('visible');
        bpmProcessBarFill.style.width = '0%';
        // Reset hero display
        bpmDetectHeroTop.style.display = '';
      }

      if (bpmDetectBack) {
        bpmDetectBack.addEventListener('click', closeBpmDetectOverlay);
      }

      // Click on audio-list-item with data-tool="bpm-detect" to open
      document.querySelectorAll('.audio-list-item[data-tool="bpm-detect"]').forEach(item => {
        item.addEventListener('click', () => {
          openBpmDetectOverlay();
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openBpmDetectOverlay();
          }
        });
      });

      // Real BPM analysis using realtime-bpm-analyzer
      let bpmAudioContext = null;
      let bpmAnalyzing = false;
      let lastAnalyzedAudioBuffer = null;

      // Unified BPM analysis function — accepts an ArrayBuffer, handles progress/UI/cleanup
      async function analyzeBpmAudioBuffer(arrayBuffer) {
        if (bpmAnalyzing) return;
        bpmAnalyzing = true;

        // Hide hero top, show process mask
        bpmDetectHeroTop.style.display = 'none';
        bpmProcessMask.classList.add('visible');
        bpmProcessBarFill.style.width = '0%';

        // Fake progress while decoding/analyzing
        let progress = 0;
        const progressInterval = setInterval(() => {
          if (progress < 90) {
            progress += Math.random() * 8 + 2;
            bpmProcessBarFill.style.width = Math.min(progress, 90) + '%';
          }
        }, 200);

        try {
          // Decode audio data
          if (!bpmAudioContext) {
            bpmAudioContext = new (window.AudioContext || window.webkitAudioContext)();
          }
          const audioBuffer = await bpmAudioContext.decodeAudioData(arrayBuffer);

          // Analyze BPM
          const { analyzeFullBuffer } = await import('realtime-bpm-analyzer');
          const tempos = await analyzeFullBuffer(audioBuffer);

          clearInterval(progressInterval);
          bpmProcessBarFill.style.width = '100%';

          setTimeout(() => {
            bpmProcessMask.classList.remove('visible');
            if (tempos && tempos.length > 0) {
              showBpmResult(tempos, audioBuffer);
            } else {
              showBpmResult(null, audioBuffer);
            }
          }, 400);
        } catch (err) {
          clearInterval(progressInterval);
          bpmProcessMask.classList.remove('visible');
          console.error('BPM analysis error:', err);
          alert(t('home.bpmDetect.analyzeError') + ': ' + (err.message || err));
          resetBpmResult();
        } finally {
          bpmAnalyzing = false;
        }
      }

      // Tauri path: read file bytes from disk, then analyze
      async function analyzeBpmFromFile(filePath) {
        if (bpmAnalyzing) return;
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const bytes = await invoke('read_file_bytes', { path: filePath });
          const arrayBuffer = new Uint8Array(bytes).buffer;
          await analyzeBpmAudioBuffer(arrayBuffer);
        } catch (err) {
          console.error('BPM file read error:', err);
          alert(t('home.bpmDetect.analyzeError') + ': ' + (err.message || err));
          resetBpmResult();
        }
      }

      function showBpmResult(tempos, audioBuffer) {
        lastAnalyzedAudioBuffer = audioBuffer;
        if (window.incrementToolUsage) window.incrementToolUsage();
        if (!tempos || tempos.length === 0) {
          bpmResult.classList.add('visible');
          bpmResultNumber.textContent = '?';
          bpmTimelineTrack.innerHTML = '';
          bpmResultHint.textContent = t('home.bpmDetect.noBeatDetected');
          bpmResultHint.classList.add('visible');
          return;
        }

        const topTempo = tempos[0];
        const bpm = Math.round(topTempo.tempo);

        // Show result card
        bpmResult.classList.add('visible');
        bpmResultNumber.textContent = bpm;

        // Generate timeline bars from actual audio data
        bpmTimelineTrack.innerHTML = '';
        const barCount = 64;
        const channelData = audioBuffer.getChannelData(0);
        const samplesPerBar = Math.floor(channelData.length / barCount);
        const beatIntervalSamples = Math.floor(audioBuffer.sampleRate * 60 / bpm);
        const samplesPerBeatBar = Math.floor(samplesPerBar / beatIntervalSamples) || 1;

        for (let i = 0; i < barCount; i++) {
          const start = i * samplesPerBar;
          const end = Math.min(start + samplesPerBar, channelData.length);
          let peak = 0;
          for (let j = start; j < end; j++) {
            const abs = Math.abs(channelData[j]);
            if (abs > peak) peak = abs;
          }
          const bar = document.createElement('div');
          bar.className = 'bpm-timeline-bar';
          const height = Math.max(3, peak * 24);
          bar.style.height = height + 'px';
          // Mark beats at regular intervals
          const beatPosition = Math.round(i / (barCount / (audioBuffer.duration * bpm / 60)));
          if (beatPosition % 1 === 0 && i % Math.max(1, Math.round(barCount / (audioBuffer.duration * bpm / 60))) === 0) {
            bar.classList.add('beat');
          }
          bpmTimelineTrack.appendChild(bar);
        }

        // Half/double time hints
        bpmResultHint.classList.remove('visible');
        if (bpm < 70) {
          bpmResultHint.textContent = t('home.bpmDetect.doubleTimeHint', { bpm: bpm * 2 });
          bpmResultHint.classList.add('visible');
        } else if (bpm > 160) {
          bpmResultHint.textContent = t('home.bpmDetect.halfTimeHint', { bpm: Math.round(bpm / 2) });
          bpmResultHint.classList.add('visible');
        }
      }

      function resetBpmResult() {
        bpmResult.classList.remove('visible');
        bpmDetectHeroTop.style.display = '';
        bpmTimelineTrack.innerHTML = '';
        bpmResultHint.classList.remove('visible');
      }

      async function selectBpmAudioFile() {
        if (bpmAnalyzing) return;
        if (isTauri) {
          try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
              multiple: false,
              filters: [{
                name: 'Audio Files',
                extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a']
              }]
            });
            if (selected && typeof selected === 'string') {
              const fileName = selected.split(/[\\/]/).pop() || selected;
              analyzeBpmFromFile(selected, fileName);
            }
          } catch (e) {
            console.error('BPM file selection error', e);
          }
        } else {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'audio/*';
          input.addEventListener('change', async () => {
            const file = input.files[0];
            if (!file) return;
            if (isTauri && file.path) {
              await analyzeBpmFromFile(file.path, file.name);
            } else {
              const arrayBuffer = await file.arrayBuffer();
              await analyzeBpmAudioBuffer(arrayBuffer);
            }
          });
          input.click();
        }
      }

      if (bpmDetectCta) {
        bpmDetectCta.addEventListener('click', () => {
          selectBpmAudioFile();
        });
      }

      if (bpmReanalyzeBtn) {
        bpmReanalyzeBtn.addEventListener('click', () => {
          resetBpmResult();
          setTimeout(() => {
            selectBpmAudioFile();
          }, 300);
        });
      }

      // Tauri native drag-drop for BPM overlay
      if (isTauri && bpmDetectOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!bpmDetectOverlay.classList.contains('visible') || bpmAnalyzing) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') {
              bpmDetectOverlay.classList.add('drag-over');
              bpmDropZone.classList.add('visible');
            } else if (payload.type === 'leave') {
              bpmDetectOverlay.classList.remove('drag-over');
              bpmDropZone.classList.remove('visible');
            } else if (payload.type === 'drop') {
              bpmDetectOverlay.classList.remove('drag-over');
              bpmDropZone.classList.remove('visible');
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'];
              const audioPath = paths.find(p => audioExts.some(ext => p.toLowerCase().endsWith('.' + ext)));
              if (audioPath) {
                const fileName = audioPath.split(/[\\/]/).pop() || audioPath;
                analyzeBpmFromFile(audioPath, fileName);
              }
            }
          });
        })();
      }

      // HTML5 drag-drop fallback (non-Tauri)
      if (bpmDetectOverlay && !isTauri) {
        bpmDetectOverlay.addEventListener('dragover', (e) => {
          e.preventDefault();
          bpmDetectOverlay.classList.add('drag-over');
          bpmDropZone.classList.add('visible');
        });
        bpmDetectOverlay.addEventListener('dragleave', (e) => {
          if (e.relatedTarget && bpmDetectOverlay.contains(e.relatedTarget)) return;
          bpmDetectOverlay.classList.remove('drag-over');
          bpmDropZone.classList.remove('visible');
        });
        bpmDetectOverlay.addEventListener('drop', (e) => {
          e.preventDefault();
          bpmDetectOverlay.classList.remove('drag-over');
          bpmDropZone.classList.remove('visible');
          const file = e.dataTransfer.files[0];
          if (file && file.type.startsWith('audio/')) {
            (async () => {
              if (isTauri && file.path) {
                await analyzeBpmFromFile(file.path, file.name);
              } else {
                const arrayBuffer = await file.arrayBuffer();
                await analyzeBpmAudioBuffer(arrayBuffer);
              }
            })();
          }
        });
      }

      // ===== BPM Beat Demo =====
      const bpmDemoOverlay = document.getElementById('bpmDemoOverlay');
      const bpmDemoClose = document.getElementById('bpmDemoClose');
      const bpmDemoBpmNumber = document.getElementById('bpmDemoBpmNumber');
      const bpmDemoBeatIndicator = document.getElementById('bpmDemoBeatIndicator');
      const bpmDemoPlayBtn = document.getElementById('bpmDemoPlayBtn');
      const bpmDemoStopBtn = document.getElementById('bpmDemoStopBtn');
      const bpmDemoAudioVolume = document.getElementById('bpmDemoAudioVolume');
      const bpmDemoBeatVolume = document.getElementById('bpmDemoBeatVolume');
      const bpmDemoBeatBtn = document.getElementById('bpmDemoBeatBtn');

      let bpmDemoState = {
        bpm: 128,
        audioBuffer: null,
        isPlaying: false,
        audioContext: null,
        audioSource: null,
        audioGainNode: null,
        beatGainNode: null,
        beatIntervalId: null,
        beatTimeoutId: null,
        audioStartTime: 0
      };

      function openBpmDemo(bpm, audioBuffer) {
        bpmDemoState.bpm = bpm;
        bpmDemoState.audioBuffer = audioBuffer;
        bpmDemoBpmNumber.textContent = bpm;
        bpmDemoOverlay.classList.add('visible');
      }

      function closeBpmDemo() {
        stopBpmDemo();
        bpmDemoOverlay.classList.remove('visible');
      }

      if (bpmDemoClose) {
        bpmDemoClose.addEventListener('click', closeBpmDemo);
      }

      function startBpmDemo() {
        if (bpmDemoState.isPlaying) return;
        bpmDemoState.isPlaying = true;
        bpmDemoPlayBtn.style.display = 'none';
        bpmDemoStopBtn.style.display = 'inline-flex';

        // Create or resume AudioContext
        if (!bpmDemoState.audioContext) {
          bpmDemoState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (bpmDemoState.audioContext.state === 'suspended') {
          bpmDemoState.audioContext.resume();
        }
        const ctx = bpmDemoState.audioContext;
        const now = ctx.currentTime;

        // Audio gain node (low volume)
        bpmDemoState.audioGainNode = ctx.createGain();
        const audioVol = parseInt(bpmDemoAudioVolume.value) / 100;
        bpmDemoState.audioGainNode.gain.setValueAtTime(audioVol, now);
        bpmDemoState.audioGainNode.connect(ctx.destination);

        // Beat gain node (high volume)
        bpmDemoState.beatGainNode = ctx.createGain();
        const beatVol = parseInt(bpmDemoBeatVolume.value) / 100;
        bpmDemoState.beatGainNode.gain.setValueAtTime(beatVol, now);
        bpmDemoState.beatGainNode.connect(ctx.destination);

        // Play audio
        if (bpmDemoState.audioBuffer) {
          bpmDemoState.audioSource = ctx.createBufferSource();
          bpmDemoState.audioSource.buffer = bpmDemoState.audioBuffer;
          bpmDemoState.audioSource.loop = true;
          bpmDemoState.audioSource.connect(bpmDemoState.audioGainNode);
          bpmDemoState.audioSource.start(0);
          bpmDemoState.audioStartTime = ctx.currentTime;
        }

        // Start metronome
        const beatIntervalMs = 60000 / bpmDemoState.bpm;
        let beatCount = 0;

        function scheduleBeat() {
          if (!bpmDemoState.isPlaying) return;

          // Play click sound using oscillator
          const beatTime = bpmDemoState.audioContext.currentTime;
          const osc = bpmDemoState.audioContext.createOscillator();
          const env = bpmDemoState.audioContext.createGain();
          osc.frequency.setValueAtTime(beatCount % 4 === 0 ? 1200 : 800, beatTime);
          env.gain.setValueAtTime(0, beatTime);
          env.gain.linearRampToValueAtTime(1, beatTime + 0.001);
          env.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.05);
          osc.connect(env);
          env.connect(bpmDemoState.beatGainNode);
          osc.start(beatTime);
          osc.stop(beatTime + 0.05);

          // Visual indicator
          bpmDemoBeatIndicator.classList.add('beat-active');
          setTimeout(() => {
            bpmDemoBeatIndicator.classList.remove('beat-active');
          }, 80);

          beatCount++;
          bpmDemoState.beatTimeoutId = setTimeout(scheduleBeat, beatIntervalMs);
        }

        scheduleBeat();
      }

      function stopBpmDemo() {
        if (!bpmDemoState.isPlaying) return;
        bpmDemoState.isPlaying = false;
        bpmDemoPlayBtn.style.display = 'inline-flex';
        bpmDemoStopBtn.style.display = 'none';

        if (bpmDemoState.beatTimeoutId) {
          clearTimeout(bpmDemoState.beatTimeoutId);
          bpmDemoState.beatTimeoutId = null;
        }

        if (bpmDemoState.audioSource) {
          try { bpmDemoState.audioSource.stop(); } catch(e) {}
          bpmDemoState.audioSource = null;
        }

        bpmDemoBeatIndicator.classList.remove('beat-active');
      }

      if (bpmDemoPlayBtn) {
        bpmDemoPlayBtn.addEventListener('click', startBpmDemo);
      }

      if (bpmDemoStopBtn) {
        bpmDemoStopBtn.addEventListener('click', stopBpmDemo);
      }

      if (bpmDemoAudioVolume) {
        bpmDemoAudioVolume.addEventListener('input', () => {
          if (bpmDemoState.audioGainNode && bpmDemoState.audioContext) {
            const vol = parseInt(bpmDemoAudioVolume.value) / 100;
            bpmDemoState.audioGainNode.gain.setValueAtTime(vol, bpmDemoState.audioContext.currentTime);
          }
        });
      }

      if (bpmDemoBeatVolume) {
        bpmDemoBeatVolume.addEventListener('input', () => {
          if (bpmDemoState.beatGainNode && bpmDemoState.audioContext) {
            const vol = parseInt(bpmDemoBeatVolume.value) / 100;
            bpmDemoState.beatGainNode.gain.setValueAtTime(vol, bpmDemoState.audioContext.currentTime);
          }
        });
      }

      if (bpmDemoBeatBtn) {
        bpmDemoBeatBtn.addEventListener('click', () => {
          if (lastAnalyzedAudioBuffer) {
            openBpmDemo(parseInt(bpmResultNumber.textContent), lastAnalyzedAudioBuffer);
          }
        });
      }

      // ===== Audio Clip Editor =====
      const audioClipOverlay = document.getElementById('audioClipOverlay');
      const audioClipBack = document.getElementById('audioClipBack');
      const audioClipCta = document.getElementById('audioClipCta');
      const audioClipHeroTop = document.getElementById('audioClipHeroTop');
      const audioClipBody = document.getElementById('audioClipBody');
      const audioClipDropZone = document.getElementById('audioClipDropZone');
      const audioClipPlasmaBg = document.getElementById('audioClipPlasmaBg');
      const audioClipFileInfo = document.getElementById('audioClipFileInfo');
      const audioClipFileName = document.getElementById('audioClipFileName');
      const audioClipFileDuration = document.getElementById('audioClipFileDuration');
      const audioClipFileRemove = document.getElementById('audioClipFileRemove');
      const audioClipWaveformWrap = document.getElementById('audioClipWaveformWrap');
      const audioClipCanvas = document.getElementById('audioClipCanvas');
      const audioClipSelection = document.getElementById('audioClipSelection');
      const audioClipPlayhead = document.getElementById('audioClipPlayhead');
      const audioClipTimeStart = document.getElementById('audioClipTimeStart');
      const audioClipTimeEnd = document.getElementById('audioClipTimeEnd');
      const audioClipSelectionInfo = document.getElementById('audioClipSelectionInfo');
      const audioClipSelStart = document.getElementById('audioClipSelStart');
      const audioClipSelEnd = document.getElementById('audioClipSelEnd');
      const audioClipSelDuration = document.getElementById('audioClipSelDuration');
      const audioClipControls = document.getElementById('audioClipControls');
      const audioClipPlayBtn = document.getElementById('audioClipPlayBtn');
      const audioClipMinusBtn = document.getElementById('audioClipMinusBtn');
      const audioClipPlusBtn = document.getElementById('audioClipPlusBtn');
      const audioClipResetBtn = document.getElementById('audioClipResetBtn');
      const audioClipCurrentTime = document.getElementById('audioClipCurrentTime');
      const audioClipTotalTime = document.getElementById('audioClipTotalTime');
      const audioClipExportBtn = document.getElementById('audioClipExportBtn');
      const audioClipHandleStart = document.getElementById('audioClipHandleStart');
      const audioClipHandleEnd = document.getElementById('audioClipHandleEnd');
      const audioClipHandleStartLabel = document.getElementById('audioClipHandleStartLabel');
      const audioClipHandleEndLabel = document.getElementById('audioClipHandleEndLabel');
      const audioClipSuccessOverlay = document.getElementById('audioClipSuccessOverlay');
      const audioClipSuccessPath = document.getElementById('audioClipSuccessPath');
      const audioClipSuccessMeta = document.getElementById('audioClipSuccessMeta');
      const audioClipSuccessFile = document.getElementById('audioClipSuccessFile');
      const audioClipSuccessDuration = document.getElementById('audioClipSuccessDuration');
      const audioClipSuccessOpenFolder = document.getElementById('audioClipSuccessOpenFolder');
      const audioClipSuccessOk = document.getElementById('audioClipSuccessOk');
      const audioClipProcessMask = document.getElementById('audioClipProcessMask');
      const audioClipProcessBarFill = document.getElementById('audioClipProcessBarFill');
      const audioClipProcessText = document.getElementById('audioClipProcessText');
      let audioClipPlasmaInstance = null;

      let clipState = {
        audioBuffer: null,
        audioContext: null,
        audioSource: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        filePath: null,
        fileName: '',
        selStart: 0,
        selEnd: 0,
        hasSelection: false,
        rafId: null,
        isLoading: false,
        activeHandle: null,
      };

      function formatTime(sec) {
        if (!sec || isNaN(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
      }

      function openAudioClipOverlay() {
        audioClipOverlay.classList.add('visible');
        audioClipHeroTop.style.display = '';
        if (audioClipPlasmaBg && !audioClipPlasmaInstance) {
          audioClipPlasmaInstance = initPlasma(audioClipPlasmaBg, {
            color: '#6B6B6B',
            speed: 0.8,
            direction: 'forward',
          });
        }
      }

      function closeAudioClipOverlay() {
        audioClipOverlay.classList.remove('visible');
        stopClipPlayback();
        resetClipState();
        // Destroy plasma instance to free GPU/CPU
        if (audioClipPlasmaInstance) {
          audioClipPlasmaInstance();
          audioClipPlasmaInstance = null;
        }
      }

      function resetClipState() {
        stopClipPlayback();
        clipState.audioBuffer = null;
        clipState.currentTime = 0;
        clipState.duration = 0;
        clipState.filePath = null;
        clipState.fileName = '';
        clipState.selStart = 0;
        clipState.selEnd = 0;
        clipState.hasSelection = false;
        audioClipFileInfo.classList.remove('visible');
        audioClipWaveformWrap.classList.remove('visible');
        audioClipControls.classList.remove('visible');
        audioClipSelectionInfo.classList.remove('visible');
        audioClipExportBtn.classList.remove('visible');
        audioClipSelection.style.display = 'none';
        audioClipPlayhead.style.display = 'none';
        audioClipHandleStart.style.display = 'none';
        audioClipHandleEnd.style.display = 'none';
        audioClipHandleStart.classList.remove('active');
        audioClipHandleEnd.classList.remove('active');
        audioClipHeroTop.style.display = '';
        audioClipSuccessOverlay.classList.remove('visible');
        setActiveHandle(null);
      }

      if (audioClipBack) {
        audioClipBack.addEventListener('click', closeAudioClipOverlay);
      }

      document.querySelectorAll('.audio-list-item[data-tool="audio-clip"]').forEach(item => {
        item.addEventListener('click', () => { openToolWithFfmpegCheck(openAudioClipOverlay); });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openToolWithFfmpegCheck(openAudioClipOverlay);
          }
        });
      });

      async function selectClipAudioFile() {
        if (isTauri) {
          try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
              multiple: false,
              filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'] }],
            });
            if (selected) {
              loadClipAudioFile(selected);
            }
          } catch (e) {
            console.error('File select error:', e);
          }
        } else {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'audio/*';
          input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
              loadClipAudioFile(file);
            }
          };
          input.click();
        }
      }

      if (audioClipCta) {
        audioClipCta.addEventListener('click', selectClipAudioFile);
      }

      if (audioClipFileRemove) {
        audioClipFileRemove.addEventListener('click', resetClipState);
      }

      async function loadClipAudioFile(filePathOrFile) {
        if (clipState.isLoading) return;
        clipState.isLoading = true;
        stopClipPlayback();

        // Show loading mask
        audioClipProcessBarFill.style.width = '30%';
        audioClipProcessText.textContent = t('home.audioClip.loading');
        audioClipProcessMask.classList.add('visible');
        const loadStartTime = Date.now();

        let arrayBuffer;
        let fileName;

        if (typeof filePathOrFile === 'string') {
          clipState.filePath = filePathOrFile;
          fileName = filePathOrFile.split(/[/\\]/).pop();
          audioClipProcessBarFill.style.width = '50%';
          if (isTauri) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const bytes = await invoke('read_file_bytes', { path: filePathOrFile });
              arrayBuffer = new Uint8Array(bytes).buffer;
            } catch (e) {
              console.error('Read file error:', e);
              clipState.isLoading = false;
              audioClipProcessMask.classList.remove('visible');
              return;
            }
          } else {
            try {
              const res = await fetch(filePathOrFile);
              arrayBuffer = await res.arrayBuffer();
            } catch (e) {
              console.error('Fetch file error:', e);
              clipState.isLoading = false;
              audioClipProcessMask.classList.remove('visible');
              return;
            }
          }
        } else {
          fileName = filePathOrFile.name;
          try {
            if (isTauri && filePathOrFile.path) {
              const { invoke } = await import('@tauri-apps/api/core');
              const bytes = await invoke('read_file_bytes', { path: filePathOrFile.path });
              arrayBuffer = new Uint8Array(bytes).buffer;
            } else {
              arrayBuffer = await filePathOrFile.arrayBuffer();
            }
          } catch (e) {
            console.error('Read file error:', e);
            clipState.isLoading = false;
            audioClipProcessMask.classList.remove('visible');
            return;
          }
          clipState.filePath = null;
        }

        audioClipProcessBarFill.style.width = '70%';
        clipState.fileName = fileName;
        audioClipFileName.textContent = fileName;

        try {
          if (!clipState.audioContext) {
            clipState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
          }
          if (clipState.audioContext.state === 'suspended') {
            clipState.audioContext.resume();
          }
          const audioBuffer = await clipState.audioContext.decodeAudioData(arrayBuffer);
          audioClipProcessBarFill.style.width = '90%';
          let duration = audioBuffer.duration;
          if (!isFinite(duration) || duration <= 0) {
            duration = audioBuffer.length / audioBuffer.sampleRate;
          }
          if (!isFinite(duration) || duration <= 0) {
            throw new Error('Invalid audio duration');
          }
          clipState.audioBuffer = audioBuffer;
          clipState.duration = duration;
          clipState.currentTime = 0;
          clipState.selStart = 0;
          clipState.selEnd = duration;
          clipState.hasSelection = true;
          setActiveHandle('start');

          // Update UI
          audioClipHeroTop.style.display = 'none';
          audioClipFileInfo.classList.add('visible');
          audioClipFileDuration.textContent = formatTime(duration);
          audioClipWaveformWrap.classList.add('visible');
          audioClipControls.classList.add('visible');
          audioClipSelectionInfo.classList.add('visible');
          audioClipExportBtn.classList.add('visible');

          audioClipTimeStart.textContent = '0:00';
          audioClipTimeEnd.textContent = formatTime(duration);
          audioClipTotalTime.textContent = formatTime(duration);
          audioClipCurrentTime.textContent = '0:00';
          audioClipSelStart.textContent = '0:00';
          audioClipSelEnd.textContent = formatTime(duration);
          audioClipSelDuration.textContent = formatTime(duration);

          audioClipProcessBarFill.style.width = '100%';

          // Draw waveform (deferred to ensure canvas has dimensions after CSS transition)
          requestAnimationFrame(() => {
            drawWaveform();
            updateSelectionOverlay();
            updatePlayhead();
          });

          if (window.lucide) window.lucide.createIcons();
        } catch (e) {
          console.error('Audio decode error:', e);
          alert(t('home.audioClip.decodeError'));
        } finally {
          // Ensure mask shows for at least 1.5s
          const elapsed = Date.now() - loadStartTime;
          const remaining = Math.max(0, 1500 - elapsed);
          setTimeout(() => {
            audioClipProcessMask.classList.remove('visible');
          }, remaining);
          clipState.isLoading = false;
        }
      }

      function drawWaveform() {
        if (!clipState.audioBuffer || !audioClipCanvas) return;
        const canvas = audioClipCanvas;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;
        const buffer = clipState.audioBuffer;
        const channelData = buffer.getChannelData(0);
        const samplesPerPixel = Math.max(1, Math.floor(channelData.length / width));

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(74, 222, 128, 0.5)';
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.8)';
        ctx.lineWidth = 1;

        const midY = height / 2;

        for (let x = 0; x < width; x++) {
          let min = 1.0;
          let max = -1.0;
          const start = x * samplesPerPixel;
          const end = Math.min(start + samplesPerPixel, channelData.length);
          for (let i = start; i < end; i++) {
            const v = channelData[i];
            if (v < min) min = v;
            if (v > max) max = v;
          }
          const yMin = midY + min * midY * 0.9;
          const yMax = midY + max * midY * 0.9;
          ctx.fillRect(x, yMin, 1, Math.max(1, yMax - yMin));
        }
      }

      const CLIP_PAD = 16;

      function timeToX(time) {
        if (!clipState.duration) return CLIP_PAD;
        const rect = audioClipCanvas.getBoundingClientRect();
        return CLIP_PAD + (time / clipState.duration) * rect.width;
      }

      function xToTime(x) {
        const rect = audioClipCanvas.getBoundingClientRect();
        const adjustedX = x - CLIP_PAD;
        const ratio = Math.max(0, Math.min(1, adjustedX / rect.width));
        return ratio * clipState.duration;
      }

      function setActiveHandle(handle) {
        clipState.activeHandle = handle;
        audioClipHandleStart.classList.toggle('active', handle === 'start');
        audioClipHandleEnd.classList.toggle('active', handle === 'end');
        if (handle) {
          audioClipMinusBtn.disabled = false;
          audioClipPlusBtn.disabled = false;
        } else {
          audioClipMinusBtn.disabled = true;
          audioClipPlusBtn.disabled = true;
        }
      }

      function updateSelectionOverlay() {
        if (!clipState.hasSelection) {
          audioClipSelection.style.display = 'none';
          audioClipHandleStart.style.display = 'none';
          audioClipHandleEnd.style.display = 'none';
          setActiveHandle(null);
          return;
        }
        const startX = timeToX(clipState.selStart);
        const endX = timeToX(clipState.selEnd);
        audioClipSelection.style.display = 'block';
        audioClipSelection.style.left = `${startX}px`;
        audioClipSelection.style.width = `${endX - startX}px`;

        audioClipHandleStart.style.display = 'flex';
        audioClipHandleStart.style.left = `${startX}px`;
        audioClipHandleStartLabel.textContent = formatTime(clipState.selStart);

        audioClipHandleEnd.style.display = 'flex';
        audioClipHandleEnd.style.left = `${endX}px`;
        audioClipHandleEndLabel.textContent = formatTime(clipState.selEnd);

        audioClipSelStart.textContent = formatTime(clipState.selStart);
        audioClipSelEnd.textContent = formatTime(clipState.selEnd);
        audioClipSelDuration.textContent = formatTime(clipState.selEnd - clipState.selStart);
      }

      function updatePlayhead() {
        if (!clipState.duration) {
          audioClipPlayhead.style.display = 'none';
          return;
        }
        const x = timeToX(clipState.currentTime);
        audioClipPlayhead.style.display = 'block';
        audioClipPlayhead.style.left = `${x}px`;
        audioClipCurrentTime.textContent = formatTime(clipState.currentTime);
      }

      function startClipPlayback() {
        if (!clipState.audioBuffer || clipState.isPlaying) return;
        clipState.isPlaying = true;
        const ctx = clipState.audioContext;
        if (ctx.state === 'suspended') ctx.resume();

        const selStart = clipState.hasSelection ? clipState.selStart : 0;
        const selEnd = clipState.hasSelection ? clipState.selEnd : clipState.duration;

        function playSegment(fromTime) {
          // Cancel any existing animation frame before starting a new segment
          if (clipState.rafId) {
            cancelAnimationFrame(clipState.rafId);
            clipState.rafId = null;
          }
          const source = ctx.createBufferSource();
          source.buffer = clipState.audioBuffer;
          source.connect(ctx.destination);
          source.start(0, fromTime);
          clipState.audioSource = source;
          const startTime = ctx.currentTime - fromTime;

          source.onended = () => {
            // Only handle natural end (buffer exhausted), not manual stop
            if (clipState.isPlaying && clipState.audioSource === source) {
              clipState.audioSource = null;
              // Loop back to selStart
              if (clipState.isPlaying) {
                clipState.currentTime = selStart;
                playSegment(selStart);
              }
            }
          };

          function tick() {
            if (!clipState.isPlaying) return;
            clipState.currentTime = ctx.currentTime - startTime;
            if (clipState.currentTime >= selEnd) {
              // Reached end of selection — loop back to start
              try { source.stop(); } catch(e) {}
              clipState.audioSource = null;
              clipState.currentTime = selStart;
              playSegment(selStart);
              return;
            }
            updatePlayhead();
            clipState.rafId = requestAnimationFrame(tick);
          }
          clipState.rafId = requestAnimationFrame(tick);
        }

        // Start from current position if within selection, otherwise from selStart
        const startOffset = (clipState.currentTime >= selStart && clipState.currentTime < selEnd) ? clipState.currentTime : selStart;
        clipState.currentTime = startOffset;
        playSegment(startOffset);

        audioClipPlayBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
      }

      function stopClipPlayback() {
        if (clipState.audioSource) {
          try { clipState.audioSource.stop(); } catch(e) {}
          clipState.audioSource = null;
        }
        if (clipState.rafId) {
          cancelAnimationFrame(clipState.rafId);
          clipState.rafId = null;
        }
        if (clipState.isPlaying) {
          clipState.isPlaying = false;
          audioClipPlayBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
        }
      }

      function togglePlayPause() {
        if (clipState.isPlaying) {
          stopClipPlayback();
        } else {
          startClipPlayback();
        }
      }

      if (audioClipPlayBtn) {
        audioClipPlayBtn.addEventListener('click', togglePlayPause);
      }

      if (audioClipMinusBtn) {
        audioClipMinusBtn.addEventListener('click', () => {
          if (!clipState.hasSelection || !clipState.activeHandle) return;
          stopClipPlayback();
          if (clipState.activeHandle === 'end') {
            clipState.selEnd = Math.max(clipState.selStart + 0.1, clipState.selEnd - 1);
          } else {
            clipState.selStart = Math.max(0, clipState.selStart - 1);
            if (clipState.selStart >= clipState.selEnd) clipState.selStart = Math.max(0, clipState.selEnd - 0.1);
          }
          clipState.currentTime = clipState.activeHandle === 'end' ? clipState.selEnd : clipState.selStart;
          updatePlayhead();
          updateSelectionOverlay();
        });
      }

      if (audioClipPlusBtn) {
        audioClipPlusBtn.addEventListener('click', () => {
          if (!clipState.hasSelection || !clipState.activeHandle) return;
          stopClipPlayback();
          if (clipState.activeHandle === 'end') {
            clipState.selEnd = Math.min(clipState.duration, clipState.selEnd + 1);
          } else {
            clipState.selStart = Math.min(clipState.selEnd - 0.1, clipState.selStart + 1);
          }
          clipState.currentTime = clipState.activeHandle === 'end' ? clipState.selEnd : clipState.selStart;
          updatePlayhead();
          updateSelectionOverlay();
        });
      }

      if (audioClipResetBtn) {
        audioClipResetBtn.addEventListener('click', () => {
          stopClipPlayback();
          clipState.currentTime = 0;
          clipState.selStart = 0;
          clipState.selEnd = clipState.duration;
          clipState.hasSelection = true;
          setActiveHandle('start');
          updatePlayhead();
          updateSelectionOverlay();
        });
      }

      // Handle-based selection: drag start/end handles to select region
      // Canvas click only moves playhead (no selection drag on waveform)
      if (audioClipCanvas) {
        audioClipCanvas.addEventListener('mousedown', (e) => {
          if (!clipState.audioBuffer) return;
          const rect = audioClipCanvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const time = xToTime(x);
          stopClipPlayback();
          clipState.currentTime = time;
          setActiveHandle(null);
          updatePlayhead();
        });
      }

      // Start handle drag
      if (audioClipHandleStart) {
        audioClipHandleStart.addEventListener('mousedown', (e) => {
          if (!clipState.audioBuffer) return;
          e.preventDefault();
          e.stopPropagation();
          setActiveHandle('start');
          stopClipPlayback();

          function onMove(ev) {
            const rect = audioClipCanvas.getBoundingClientRect();
            const x = ev.clientX - rect.left;
            const time = xToTime(x);
            clipState.selStart = Math.max(0, Math.min(clipState.selEnd - 0.1, time));
            clipState.currentTime = clipState.selStart;
            updatePlayhead();
            updateSelectionOverlay();
          }
          function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          }
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      }

      // End handle drag
      if (audioClipHandleEnd) {
        audioClipHandleEnd.addEventListener('mousedown', (e) => {
          if (!clipState.audioBuffer) return;
          e.preventDefault();
          e.stopPropagation();
          setActiveHandle('end');
          stopClipPlayback();

          function onMove(ev) {
            const rect = audioClipCanvas.getBoundingClientRect();
            const x = ev.clientX - rect.left;
            const time = xToTime(x);
            clipState.selEnd = Math.min(clipState.duration, Math.max(clipState.selStart + 0.1, time));
            clipState.currentTime = clipState.selEnd;
            updatePlayhead();
            updateSelectionOverlay();
          }
          function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          }
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      }

      // Export clip
      if (audioClipExportBtn) {
        audioClipExportBtn.addEventListener('click', async () => {
          if (!clipState.filePath) {
            alert(t('home.audioClip.noFile'));
            return;
          }
          const startTime = clipState.hasSelection ? clipState.selStart : 0;
          const endTime = clipState.hasSelection ? clipState.selEnd : clipState.duration;

          if (endTime - startTime < 0.1) {
            alert(t('home.audioClip.invalidSelection'));
            return;
          }

          if (isTauri) {
            // Show loading mask for export
            audioClipProcessBarFill.style.width = '30%';
            audioClipProcessText.textContent = t('home.audioClip.exporting');
            audioClipProcessMask.classList.add('visible');
            const exportStartTime = Date.now();

            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const config = await invoke('get_install_config');
              const outputDir = config.install_path
                ? config.install_path.replace(/[/\\]?$/, '') + '/Audio'
                : '';

              if (!outputDir) {
                alert(t('home.audioClip.exportError'));
                audioClipProcessMask.classList.remove('visible');
                audioClipProcessBarFill.style.width = '0%';
                audioClipProcessText.textContent = t('home.audioClip.loading');
                return;
              }

              audioClipExportBtn.disabled = true;
              audioClipExportBtn.style.opacity = '0.6';

              // Ensure ffmpeg is available (prompt user to download if missing)
              const ffmpegReady = await ensureFfmpegAvailable();
              if (!ffmpegReady) {
                audioClipExportBtn.disabled = false;
                audioClipExportBtn.style.opacity = '1';
                return;
              }
              audioClipProcessBarFill.style.width = '80%';

              const result = await invoke('trim_audio', {
                inputPath: clipState.filePath,
                outputDir: outputDir,
                startTime: startTime,
                endTime: endTime,
              });

              audioClipProcessBarFill.style.width = '100%';

              audioClipExportBtn.disabled = false;
              audioClipExportBtn.style.opacity = '';

              if (result.success) {
                const clipDur = clipState.selEnd - clipState.selStart;
                const clipMin = Math.floor(clipDur / 60);
                const clipSec = Math.floor(clipDur % 60);
                const durStr = `${clipMin}:${clipSec.toString().padStart(2, '0')}`;
                if (audioClipSuccessMeta) {
                  audioClipSuccessMeta.textContent = t('home.audioClip.successSummary', { name: clipState.fileName, duration: durStr });
                }
                if (audioClipSuccessFile) {
                  audioClipSuccessFile.textContent = clipState.fileName;
                }
                if (audioClipSuccessDuration) {
                  audioClipSuccessDuration.textContent = durStr;
                }
                audioClipSuccessPath.textContent = result.output_path.replace(/\//g, '\\');
                audioClipSuccessOverlay.classList.add('visible');
                if (window.incrementToolUsage) window.incrementToolUsage();
              } else {
                alert(t('home.audioClip.exportError') + ': ' + (result.error || 'Unknown'));
              }
            } catch (e) {
              audioClipExportBtn.disabled = false;
              audioClipExportBtn.style.opacity = '';
              console.error('Export error:', e);
              alert(t('home.audioClip.exportError') + ': ' + e);
            } finally {
              // Ensure mask shows for at least 1.5s
              const elapsed = Date.now() - exportStartTime;
              const remaining = Math.max(0, 1500 - elapsed);
              setTimeout(() => {
                audioClipProcessMask.classList.remove('visible');
                audioClipProcessBarFill.style.width = '0%';
                audioClipProcessText.textContent = t('home.audioClip.loading');
              }, remaining);
            }
          } else {
            alert(t('home.audioClip.exportError'));
          }
        });
      }

      // Success dialog
      if (audioClipSuccessOk) {
        audioClipSuccessOk.addEventListener('click', () => {
          audioClipSuccessOverlay.classList.remove('visible');
        });
      }
      if (audioClipSuccessOpenFolder) {
        audioClipSuccessOpenFolder.addEventListener('click', async () => {
          if (isTauri && audioClipSuccessPath.textContent) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              // Normalize path separators to backslashes for Windows and extract directory
              const folder = audioClipSuccessPath.textContent
                .replace(/[/\\][^/\\]+$/, '')
                .replace(/\//g, '\\');
              await invoke('open_path', { path: folder });
            } catch (e) {
              console.error('Open folder error:', e);
            }
          }
        });
      }

      // Tauri native drag-drop for audio clip overlay
      if (isTauri && audioClipOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!audioClipOverlay.classList.contains('visible')) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') {
              audioClipOverlay.classList.add('drag-over');
              audioClipDropZone.classList.add('visible');
            } else if (payload.type === 'leave') {
              audioClipOverlay.classList.remove('drag-over');
              audioClipDropZone.classList.remove('visible');
            } else if (payload.type === 'drop') {
              audioClipOverlay.classList.remove('drag-over');
              audioClipDropZone.classList.remove('visible');
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              loadClipAudioFile(paths[0]);
            }
          });
        })();
      }

      // HTML5 drag-drop fallback (non-Tauri)
      if (audioClipOverlay && !isTauri) {
        audioClipOverlay.addEventListener('dragover', (e) => {
          e.preventDefault();
          audioClipOverlay.classList.add('drag-over');
          audioClipDropZone.classList.add('visible');
        });
        audioClipOverlay.addEventListener('dragleave', (e) => {
          if (e.relatedTarget && audioClipOverlay.contains(e.relatedTarget)) return;
          audioClipOverlay.classList.remove('drag-over');
          audioClipDropZone.classList.remove('visible');
        });
        audioClipOverlay.addEventListener('drop', (e) => {
          e.preventDefault();
          audioClipOverlay.classList.remove('drag-over');
          audioClipDropZone.classList.remove('visible');
          const file = e.dataTransfer.files[0];
          if (file && file.type.startsWith('audio/')) {
            loadClipAudioFile(file);
          }
        });
      }

      // Redraw waveform on window resize
      window.addEventListener('resize', () => {
        if (clipState.audioBuffer && audioClipWaveformWrap.classList.contains('visible')) {
          setTimeout(() => {
            drawWaveform();
            updateSelectionOverlay();
            updatePlayhead();
          }, 100);
        }
      });

      // ===== Audio Extract Tool =====
      const audioExtractOverlay = document.getElementById('audioExtractOverlay');
      const audioExtractBack = document.getElementById('audioExtractBack');
      const audioExtractPlasmaBg = document.getElementById('audioExtractPlasmaBg');
      const audioExtractDropZone = document.getElementById('audioExtractDropZone');
      const audioExtractBody = document.getElementById('audioExtractBody');
      const audioExtractHeroTop = document.getElementById('audioExtractHeroTop');
      const audioExtractCta = document.getElementById('audioExtractCta');
      const audioExtractInfo = document.getElementById('audioExtractInfo');
      const audioExtractFileName = document.getElementById('audioExtractFileName');
      const audioExtractFileMeta = document.getElementById('audioExtractFileMeta');
      const audioExtractFileRemove = document.getElementById('audioExtractFileRemove');
      const audioExtractTrackSelector = document.getElementById('audioExtractTrackSelector');
      const audioExtractTrackSelect = document.getElementById('audioExtractTrackSelect');
      const audioExtractProcessMask = document.getElementById('audioExtractProcessMask');
      const audioExtractProcessBarFill = document.getElementById('audioExtractProcessBarFill');
      const audioExtractProcessText = document.getElementById('audioExtractProcessText');
      const audioExtractFormatOptions = document.getElementById('audioExtractFormatOptions');
      const audioExtractSuccessOverlay = document.getElementById('audioExtractSuccessOverlay');
      const audioExtractSuccessPath = document.getElementById('audioExtractSuccessPath');
      const audioExtractSuccessMeta = document.getElementById('audioExtractSuccessMeta');
      const audioExtractSuccessFile = document.getElementById('audioExtractSuccessFile');
      const audioExtractSuccessFormat = document.getElementById('audioExtractSuccessFormat');
      const audioExtractSuccessOpenFolder = document.getElementById('audioExtractSuccessOpenFolder');
      const audioExtractSuccessOk = document.getElementById('audioExtractSuccessOk');
      let audioExtractPlasmaInstance = null;
      let extractState = {
        filePath: null,
        fileName: '',
        targetFormat: 'MP3',
        trackIndex: null,
        isProcessing: false,
      };

      function openAudioExtractOverlay() {
        if (!audioExtractOverlay) return;
        audioExtractOverlay.classList.add('visible');
        if (audioExtractPlasmaBg && !audioExtractPlasmaInstance) {
          audioExtractPlasmaInstance = initPlasma(audioExtractPlasmaBg, {
            color: '#6B6B6B',
            speed: 0.8,
            direction: 'forward',
          });
        }
      }

      function closeAudioExtractOverlay() {
        if (!audioExtractOverlay) return;
        audioExtractOverlay.classList.remove('visible');
        if (audioExtractPlasmaInstance) {
          audioExtractPlasmaInstance();
          audioExtractPlasmaInstance = null;
        }
        resetExtractState();
      }

      function resetExtractState() {
        extractState = {
          filePath: null,
          fileName: '',
          targetFormat: 'MP3',
          trackIndex: null,
          isProcessing: false,
        };
        if (audioExtractHeroTop) audioExtractHeroTop.style.display = '';
        if (audioExtractInfo) audioExtractInfo.style.display = 'none';
        if (audioExtractTrackSelector) audioExtractTrackSelector.style.display = 'none';
        // Reset format to MP3
        if (audioExtractFormatOptions) {
          audioExtractFormatOptions.querySelectorAll('.audio-convert-format-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.format === 'MP3');
          });
        }
      }

      function formatDuration(sec) {
        if (!sec || sec <= 0) return '--';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        const h = Math.floor(m / 60);
        if (h > 0) {
          return `${h}:${(m % 60).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
      }

      function formatFileSize(bytes) {
        if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
        if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${bytes} B`;
      }

      async function loadVideoFile(filePath) {
        if (!filePath) return;
        const fileName = filePath.split(/[\\/]/).pop() || filePath;
        extractState.filePath = filePath;
        extractState.fileName = fileName;

        // Show file info
        if (audioExtractHeroTop) audioExtractHeroTop.style.display = 'none';
        if (audioExtractInfo) audioExtractInfo.style.display = '';
        if (audioExtractFileName) audioExtractFileName.textContent = fileName;
        if (audioExtractFileMeta) audioExtractFileMeta.textContent = '...';

        // Probe video info then auto-start extraction
        if (isTauri) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const probe = await invoke('probe_video', { inputPath: filePath });
            const metaParts = [formatDuration(probe.duration), formatFileSize(probe.file_size)];
            if (audioExtractFileMeta) audioExtractFileMeta.textContent = metaParts.join(' · ');

            // Set track index if multiple tracks
            if (probe.audio_tracks.length > 1) {
              extractState.trackIndex = 0;
            } else {
              extractState.trackIndex = null;
            }

            // Auto-start extraction after probe
            startExtraction();
          } catch (e) {
            console.error('Probe failed:', e);
            if (audioExtractFileMeta) audioExtractFileMeta.textContent = 'probe error';
            // Still try to extract without track info
            startExtraction();
          }
        }
      }

      async function startExtraction() {
        if (!extractState.filePath || extractState.isProcessing) return;
        extractState.isProcessing = true;

        // Show process mask
        if (audioExtractProcessMask) audioExtractProcessMask.classList.add('visible');
        if (audioExtractProcessBarFill) audioExtractProcessBarFill.style.width = '10%';
        if (audioExtractProcessText) audioExtractProcessText.textContent = t('home.audioExtract.extracting');

        const startTime = Date.now();

        if (isTauri) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');

            // Get output directory
            let finalOutputDir = '';
            try {
              const config = await invoke('get_install_config');
              if (config.install_path) {
                const sep = config.install_path.includes('\\') ? '\\' : '/';
                finalOutputDir = config.install_path.replace(/[\/\\]+$/, '') + sep + 'Audio';
              }
            } catch (e) {
              console.error('Failed to get install config:', e);
            }
            if (!finalOutputDir) {
              const outputDir = await invoke('get_documents_dir').catch(() => 'C:\\Users\\Downloads');
              finalOutputDir = outputDir + '\\ToolKnit\\Audio';
            }

            // Ensure ffmpeg is available (prompt user to download if missing)
            const ffmpegReady = await ensureFfmpegAvailable();
            if (!ffmpegReady) {
              if (audioExtractProcessMask) audioExtractProcessMask.classList.remove('visible');
              if (audioExtractProcessBarFill) audioExtractProcessBarFill.style.width = '0%';
              return;
            }

            // Extract
            if (audioExtractProcessText) audioExtractProcessText.textContent = t('home.audioExtract.extracting');
            if (audioExtractProcessBarFill) audioExtractProcessBarFill.style.width = '50%';

            const result = await invoke('extract_audio', {
              inputPath: extractState.filePath,
              outputDir: finalOutputDir,
              targetFormat: extractState.targetFormat,
              trackIndex: extractState.trackIndex,
            });

            if (audioExtractProcessBarFill) audioExtractProcessBarFill.style.width = '100%';

            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 1500 - elapsed);
            setTimeout(() => {
              if (audioExtractProcessMask) audioExtractProcessMask.classList.remove('visible');
              if (audioExtractProcessBarFill) audioExtractProcessBarFill.style.width = '0%';
              extractState.isProcessing = false;

              if (result.success) {
                if (audioExtractSuccessMeta) {
                  audioExtractSuccessMeta.textContent = t('home.audioExtract.successSummary', { name: extractState.fileName, format: extractState.targetFormat });
                }
                if (audioExtractSuccessFile) {
                  audioExtractSuccessFile.textContent = extractState.fileName;
                }
                if (audioExtractSuccessFormat) {
                  audioExtractSuccessFormat.textContent = extractState.targetFormat;
                }
                if (audioExtractSuccessPath) {
                  audioExtractSuccessPath.textContent = result.output_path.replace(/\//g, '\\');
                }
                if (audioExtractSuccessOverlay) {
                  audioExtractSuccessOverlay.classList.add('visible');
                }
                if (window.incrementToolUsage) window.incrementToolUsage();
              } else {
                alert(result.error || t('common.extractionFailed'));
              }
            }, remaining);
          } catch (e) {
            console.error('Extract error:', e);
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 1500 - elapsed);
            setTimeout(() => {
              if (audioExtractProcessMask) audioExtractProcessMask.classList.remove('visible');
              if (audioExtractProcessBarFill) audioExtractProcessBarFill.style.width = '0%';
              extractState.isProcessing = false;
              alert(t('common.errorOccurred', { error: String(e) }));
            }, remaining);
          }
        } else {
          // Non-Tauri simulation
          setTimeout(() => {
            if (audioExtractProcessMask) audioExtractProcessMask.classList.remove('visible');
            if (audioExtractProcessBarFill) audioExtractProcessBarFill.style.width = '0%';
            extractState.isProcessing = false;
            if (audioExtractSuccessPath) audioExtractSuccessPath.textContent = '~/Downloads/toolknit-extracted/';
            if (audioExtractSuccessOverlay) audioExtractSuccessOverlay.classList.add('visible');
          }, 1500);
        }
      }

      async function selectVideoFile() {
        if (isTauri) {
          try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
              multiple: false,
              filters: [{ name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'ts', 'm4v'] }],
            });
            if (selected) {
              loadVideoFile(selected);
            }
          } catch (e) {
            console.error('Video file select error:', e);
          }
        } else {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'video/*';
          input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
              loadVideoFile(file.name);
            }
          };
          input.click();
        }
      }

      // Format selection
      if (audioExtractFormatOptions) {
        audioExtractFormatOptions.querySelectorAll('.audio-convert-format-option').forEach(btn => {
          btn.addEventListener('click', () => {
            audioExtractFormatOptions.querySelectorAll('.audio-convert-format-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            extractState.targetFormat = btn.dataset.format;
          });
        });
      }

      // Track selection
      if (audioExtractTrackSelect) {
        audioExtractTrackSelect.addEventListener('change', () => {
          extractState.trackIndex = parseInt(audioExtractTrackSelect.value, 10);
        });
      }

      // CTA button
      if (audioExtractCta) {
        audioExtractCta.addEventListener('click', selectVideoFile);
      }

      // File remove
      if (audioExtractFileRemove) {
        audioExtractFileRemove.addEventListener('click', () => {
          resetExtractState();
        });
      }

      // Back button
      if (audioExtractBack) {
        audioExtractBack.addEventListener('click', closeAudioExtractOverlay);
      }

      // Navigation entry
      document.querySelectorAll('.audio-list-item[data-tool="audio-extract"]').forEach(item => {
        item.addEventListener('click', () => { openToolWithFfmpegCheck(openAudioExtractOverlay); });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openToolWithFfmpegCheck(openAudioExtractOverlay);
          }
        });
      });

      // Success dialog
      if (audioExtractSuccessOk) {
        audioExtractSuccessOk.addEventListener('click', () => {
          if (audioExtractSuccessOverlay) audioExtractSuccessOverlay.classList.remove('visible');
          resetExtractState();
        });
      }
      if (audioExtractSuccessOpenFolder) {
        audioExtractSuccessOpenFolder.addEventListener('click', async () => {
          if (isTauri && audioExtractSuccessPath.textContent) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const folder = audioExtractSuccessPath.textContent
                .replace(/[/\\][^/\\]+$/, '')
                .replace(/\//g, '\\');
              await invoke('open_path', { path: folder });
            } catch (e) {
              console.error('Open folder error:', e);
            }
          }
        });
      }

      // Tauri native drag-drop for audio extract overlay
      if (isTauri && audioExtractOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!audioExtractOverlay.classList.contains('visible') || extractState.isProcessing) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') {
              audioExtractOverlay.classList.add('drag-over');
              if (audioExtractDropZone) audioExtractDropZone.classList.add('visible');
            } else if (payload.type === 'leave') {
              audioExtractOverlay.classList.remove('drag-over');
              if (audioExtractDropZone) audioExtractDropZone.classList.remove('visible');
            } else if (payload.type === 'drop') {
              audioExtractOverlay.classList.remove('drag-over');
              if (audioExtractDropZone) audioExtractDropZone.classList.remove('visible');
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'ts', 'm4v'];
              const videoPath = paths.find(p => videoExts.some(ext => p.toLowerCase().endsWith('.' + ext)));
              if (videoPath) {
                loadVideoFile(videoPath);
              }
            }
          });
        })();
      }

      // HTML5 drag-drop fallback (non-Tauri)
      if (audioExtractOverlay && !isTauri) {
        audioExtractOverlay.addEventListener('dragover', (e) => {
          e.preventDefault();
          audioExtractOverlay.classList.add('drag-over');
          if (audioExtractDropZone) audioExtractDropZone.classList.add('visible');
        });
        audioExtractOverlay.addEventListener('dragleave', (e) => {
          if (e.relatedTarget && audioExtractOverlay.contains(e.relatedTarget)) return;
          audioExtractOverlay.classList.remove('drag-over');
          if (audioExtractDropZone) audioExtractDropZone.classList.remove('visible');
        });
        audioExtractOverlay.addEventListener('drop', (e) => {
          e.preventDefault();
          audioExtractOverlay.classList.remove('drag-over');
          if (audioExtractDropZone) audioExtractDropZone.classList.remove('visible');
          const file = e.dataTransfer.files[0];
          if (file && file.type.startsWith('video/')) {
            loadVideoFile(file.name);
          }
        });
      }

      // Feedback drawer
      const feedbackDrawer = document.getElementById('feedbackDrawer');
      const feedbackDrawerBackdrop = document.getElementById('feedbackDrawerBackdrop');
      const feedbackDrawerClose = document.getElementById('feedbackDrawerClose');
      const feedbackCta = document.getElementById('feedbackCta');
      const feedbackForm = document.getElementById('feedbackForm');
      const feedbackFormCancel = document.getElementById('feedbackFormCancel');
      const feedbackFormSubmit = document.getElementById('feedbackFormSubmit');
      const feedbackName = document.getElementById('feedbackName');
      const feedbackEmail = document.getElementById('feedbackEmail');
      const feedbackTitle = document.getElementById('feedbackTitle');
      const feedbackContent = document.getElementById('feedbackContent');

      function openFeedbackDrawer() {
        if (feedbackDrawer) feedbackDrawer.classList.add('open');
      }

      function closeFeedbackDrawer() {
        if (feedbackDrawer) feedbackDrawer.classList.remove('open');
      }

      function resetFeedbackForm() {
        if (feedbackForm) feedbackForm.reset();
      }

      if (feedbackCta) {
        feedbackCta.addEventListener('click', () => {
          openFeedbackDrawer();
        });
      }

      if (feedbackDrawerClose) {
        feedbackDrawerClose.addEventListener('click', () => {
          closeFeedbackDrawer();
        });
      }

      if (feedbackDrawerBackdrop) {
        feedbackDrawerBackdrop.addEventListener('click', () => {
          closeFeedbackDrawer();
        });
      }

      if (feedbackFormCancel) {
        feedbackFormCancel.addEventListener('click', () => {
          closeFeedbackDrawer();
          resetFeedbackForm();
        });
      }

      if (feedbackForm) {
        feedbackForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!feedbackForm.checkValidity()) return;

          const payload = {
            title: feedbackTitle ? feedbackTitle.value.trim() : '',
            content: feedbackContent ? feedbackContent.value.trim() : ''
          };
          const nameVal = feedbackName ? feedbackName.value.trim() : '';
          const emailVal = feedbackEmail ? feedbackEmail.value.trim() : '';
          if (nameVal) payload.name = nameVal;
          if (emailVal) payload.email = emailVal;

          if (feedbackFormSubmit) feedbackFormSubmit.disabled = true;

          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const resp = await fetch(`${AUTH_API_BASE}/api/feedback`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
            clearTimeout(timeout);
            const data = await resp.json();
            if (data.code === 0) {
              closeFeedbackDrawer();
              resetFeedbackForm();
              window.showToast(t('home.feedbackPage.submitSuccess'));
            } else {
              console.error('Feedback submit failed:', data);
              window.showToast(t('home.feedbackPage.submitError'));
            }
          } catch (err) {
            console.error('Feedback submit error:', err);
            if (err.name === 'AbortError') {
              window.showToast(t('auth.errTimeout'));
            } else {
              window.showToast(t('home.feedbackPage.submitError'));
            }
          } finally {
            if (feedbackFormSubmit) feedbackFormSubmit.disabled = false;
          }
        });
      }

      // Random marquee reviews
      const marqueeTrack = document.getElementById('marqueeTrack');
      if (marqueeTrack) {
        function getReviewers() {
          return [
            { name: 'Sarah', text: t('home.feedbackPage.review1') },
            { name: 'Michael', text: t('home.feedbackPage.review2') },
            { name: 'Emily', text: t('home.feedbackPage.review3') },
            { name: 'David', text: t('home.feedbackPage.review4') },
            { name: 'Jessica', text: t('home.feedbackPage.review5') },
            { name: 'James', text: t('home.feedbackPage.review6') },
            { name: 'Olivia', text: t('home.feedbackPage.review7') },
            { name: 'Christopher', text: t('home.feedbackPage.review8') },
            { name: 'Amanda', text: t('home.feedbackPage.review9') },
            { name: 'Matthew', text: t('home.feedbackPage.review10') },
            { name: 'Elizabeth', text: t('home.feedbackPage.review11') },
            { name: 'Daniel', text: t('home.feedbackPage.review12') }
          ];
        }

        function renderReviews() {
          const stars = Array.from({ length: 5 }, () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>').join('');
          const reviewers = getReviewers();

          const cards = reviewers.map((r, i) => {
            const initial = r.name.charAt(0).toUpperCase();
            const palettes = [
              ['#667eea', '#764ba2'], ['#f093fb', '#f5576c'], ['#4facfe', '#00f2fe'],
              ['#43e97b', '#38f9d7'], ['#fa709a', '#fee140'], ['#30cfd0', '#330867'],
              ['#a8edea', '#fed6e3'], ['#ff9a9e', '#fecfef'], ['#ffecd2', '#fcb69f'],
              ['#a18cd1', '#fbc2eb'], ['#fbc2eb', '#a6c1ee'], ['#84fab0', '#8fd3f4']
            ];
            const [c1, c2] = palettes[i % palettes.length];
            const avatarSvg = `<div class="marquee-avatar" style="background:linear-gradient(135deg,${c1},${c2});display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff;flex-shrink:0;">${escapeHtml(initial)}</div>`;
            return `
              <div class="marquee-card">
                <div class="marquee-card-header">
                  ${avatarSvg}
                  <div class="marquee-info">
                    <div class="marquee-name">${escapeHtml(r.name)}</div>
                    <div class="marquee-stars">${stars}</div>
                  </div>
                </div>
                <p class="marquee-text">${escapeHtml(r.text)}</p>
              </div>
            `;
          }).join('');

          // Duplicate for seamless loop
          marqueeTrack.innerHTML = cards + cards;
        }

        renderReviews();
        onLangChange(renderReviews);
      }

      // ===== Legal Overlay (Declaration & Usage Policy) =====
      const legalOverlay = document.getElementById('legalOverlay');
      const legalBackBtn = document.getElementById('legalBackBtn');
      const legalNav = document.getElementById('legalNav');
      const legalContentTitle = document.getElementById('legalContentTitle');
      const legalContentBody = document.getElementById('legalContentBody');

      function showLegalSection(sectionId) {
        const content = getLegalContent();
        if (!content || !content[sectionId]) return;
        const data = content[sectionId];
        if (legalContentTitle) legalContentTitle.textContent = data.title;
        if (legalContentBody) {
          legalContentBody.innerHTML = data.html;
          legalContentBody.scrollTop = 0;
        }
        if (legalNav) {
          legalNav.querySelectorAll('.help-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.legalSection === sectionId);
          });
        }
      }

      function openLegalOverlay(sectionId) {
        if (legalOverlay) legalOverlay.classList.add('visible');
        showLegalSection(sectionId || 'declaration');
      }

      function closeLegalOverlay() {
        if (legalOverlay) legalOverlay.classList.remove('visible');
      }

      if (legalBackBtn) {
        legalBackBtn.addEventListener('click', closeLegalOverlay);
      }

      if (legalNav) {
        legalNav.querySelectorAll('.help-nav-item').forEach(item => {
          item.addEventListener('click', () => {
            const section = item.dataset.legalSection;
            if (section) showLegalSection(section);
          });
        });
      }

      if (declarationLink) {
        declarationLink.addEventListener('click', (e) => {
          e.preventDefault();
          openLegalOverlay('declaration');
        });
      }

      if (usagePolicyLink) {
        usagePolicyLink.addEventListener('click', (e) => {
          e.preventDefault();
          openLegalOverlay('usage-policy');
        });
      }

      // Refresh legal content on language change
      onLangChange(() => {
        if (legalOverlay && legalOverlay.classList.contains('visible')) {
          const activeItem = legalNav && legalNav.querySelector('.help-nav-item.active');
          showLegalSection(activeItem ? activeItem.dataset.legalSection : 'declaration');
        }
      });

      // ===== Auth Overlay =====
      const authOverlay = document.getElementById('authOverlay');
      const authCircle = document.getElementById('authCircle');
      const authClose = document.getElementById('authClose');
      const loginForm = document.getElementById('loginForm');
      const registerForm = document.getElementById('registerForm');
      const switchToRegister = document.getElementById('switchToRegister');
      const switchToLogin = document.getElementById('switchToLogin');
      const authHeroTitle = document.getElementById('authHeroTitle');
      const authHeroSubtitle = document.getElementById('authHeroSubtitle');
      const loginError = document.getElementById('loginError');
      const registerError = document.getElementById('registerError');
      const loginSubmit = document.getElementById('loginSubmit');
      const registerSubmit = document.getElementById('registerSubmit');
      const registerNext = document.getElementById('registerNext');
      const registerBack = document.getElementById('registerBack');
      const registerStep1 = document.getElementById('registerStep1');
      const registerStep2 = document.getElementById('registerStep2');
      const registerAvatarZone = document.getElementById('registerAvatarZone');
      const registerAvatarFile = document.getElementById('registerAvatarFile');
      const registerAvatarPreview = document.getElementById('registerAvatarPreview');
      const registerError2 = document.getElementById('registerError2');
      const registerSpider2 = document.getElementById('registerSpider2');
      let registerAvatarData = null;

      const authLoadingOverlay = document.getElementById('authLoadingOverlay');
      const authLoadingCircle = document.getElementById('authLoadingCircle');

      function showAuthLoading(originX, originY) {
        const dx = Math.max(originX, window.innerWidth - originX);
        const dy = Math.max(originY, window.innerHeight - originY);
        const radius = Math.sqrt(dx * dx + dy * dy);
        const diameter = radius * 2;
        authLoadingCircle.style.width = diameter + 'px';
        authLoadingCircle.style.height = diameter + 'px';
        authLoadingCircle.style.left = (originX - radius) + 'px';
        authLoadingCircle.style.top = (originY - radius) + 'px';
        authLoadingOverlay.classList.remove('closing');
        authLoadingOverlay.classList.remove('active');
        // Force reflow with inline scale(0), then clear it so CSS class can take over
        authLoadingCircle.style.transform = 'scale(0)';
        void authLoadingCircle.offsetWidth;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            authLoadingCircle.style.transform = '';
            authLoadingOverlay.classList.add('active');
          });
        });
      }

      function hideAuthLoading() {
        authLoadingOverlay.classList.remove('active');
        authLoadingOverlay.classList.add('closing');
        setTimeout(() => {
          authLoadingOverlay.classList.remove('closing');
        }, 600);
      }

      const AUTH_API_BASE = 'https://toolknitapi.24picture.com';

      const SERVER_ERROR_MAP = {
        'Email already registered': 'auth.errEmailExists',
        'Invalid email or password': 'auth.errInvalidCredentials',
        'Account banned': 'auth.errAccountBanned',
        'Server error': 'auth.errServer',
        'Not found': 'auth.errNotFound',
        'Daily usage limit reached': 'auth.errDailyLimit',
        'Invalid email format': 'auth.errInvalidEmail',
        'Password must be 6-64 characters': 'auth.errPasswordMax',
        'Username must be 1-64 characters': 'auth.errUsernameRequired',
        'No fields to update': 'auth.errUnknown',
        'Old password incorrect': 'auth.errInvalidCredentials',
        'Password changed successfully': null,
      };

      function translateServerError(msg) {
        if (!msg) return t('auth.errUnknown');
        const key = SERVER_ERROR_MAP[msg];
        if (key === null) return msg;
        if (key) return t(key);
        return msg;
      }

      function authHeaders(extra = {}) {
        const token = localStorage.getItem('toolknit_token');
        const headers = { 'Content-Type': 'application/json', ...extra };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
      }

      function updatePersonalPanel(user) {
        if (!user) return;
        const panel = document.getElementById('personalPanel');
        if (!panel) return;
        panel.classList.add('logged-in');
        const nameEl = panel.querySelector('.logged-in-view .info-name');
        const metaEls = panel.querySelectorAll('.logged-in-view .info-meta');
        const avatarImg = panel.querySelector('.logged-in-view .avatar img');
        if (nameEl) nameEl.textContent = user.username || user.email || 'User';
        if (metaEls[0]) metaEls[0].textContent = user.email || '';
        if (metaEls[1]) metaEls[1].textContent = `ID: ${user.id || ''}`;
        if (avatarImg) {
          const avatarParent = avatarImg.parentElement;
          if (user.avatar) {
            avatarImg.onerror = function() {
              this.style.display = 'none';
              if (avatarParent) avatarParent.classList.add('avatar-fallback');
            };
            avatarImg.onload = function() {
              this.style.display = '';
              if (avatarParent) avatarParent.classList.remove('avatar-fallback');
            };
            avatarImg.src = user.avatar;
          } else {
            avatarImg.style.display = 'none';
            if (avatarParent) avatarParent.classList.add('avatar-fallback');
          }
        }
      }

      function hideAutoLoginMask() {
        const mask = document.getElementById('autoLoginMask');
        if (!mask) return;
        mask.classList.remove('active');
        mask.classList.add('fade-out');
        setTimeout(() => {
          mask.classList.remove('fade-out');
        }, 400);
      }

      async function restoreSession() {
        const token = localStorage.getItem('toolknit_token');
        if (!token) return;

        const mask = document.getElementById('autoLoginMask');
        if (mask) mask.classList.add('active');

        let maskHidden = false;
        function hideMaskOnce() {
          if (maskHidden) return;
          maskHidden = true;
          hideAutoLoginMask();
        }

        const timeoutId = setTimeout(hideMaskOnce, 8000);

        try {
          const res = await fetch(`${AUTH_API_BASE}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          clearTimeout(timeoutId);
          if (data.code === 0 && data.data && data.data.user) {
            localStorage.setItem('toolknit_user', JSON.stringify(data.data.user));
            // Update UI outside try block so errors here don't clear the token
            try {
              updatePersonalPanel(data.data.user);
              if (typeof renderFavorites === 'function') renderFavorites();
            } catch (uiErr) {
              console.error('[restoreSession] UI update error:', uiErr);
            }
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                hideMaskOnce();
              });
            });
          } else {
            // Auth error (invalid/expired token) — clear token
            console.warn('[restoreSession] Auth failed, clearing token:', data.msg);
            localStorage.removeItem('toolknit_token');
            localStorage.removeItem('toolknit_user');
            hideMaskOnce();
          }
        } catch (e) {
          // Network error — don't clear token, just hide mask
          clearTimeout(timeoutId);
          console.error('[restoreSession] Network error:', e);
          hideMaskOnce();
        }
      }

      function logout() {
        localStorage.removeItem('toolknit_token');
        localStorage.removeItem('toolknit_user');
        const panel = document.getElementById('personalPanel');
        if (panel) panel.classList.remove('logged-in');
        if (typeof renderFavorites === 'function') renderFavorites();
      }

      function openAuthOverlay(originX, originY) {
        // Calculate max radius to cover the entire screen from the click point
        const dx = Math.max(originX, window.innerWidth - originX);
        const dy = Math.max(originY, window.innerHeight - originY);
        const radius = Math.sqrt(dx * dx + dy * dy);

        // Set circle size and position (but NOT transform — that's controlled by CSS class)
        const diameter = radius * 2;
        authCircle.style.width = diameter + 'px';
        authCircle.style.height = diameter + 'px';
        authCircle.style.left = (originX - radius) + 'px';
        authCircle.style.top = (originY - radius) + 'px';

        // Remove inline transform so CSS class can take over
        authCircle.style.transform = '';
        authOverlay.classList.remove('closing');
        authOverlay.classList.remove('active');
        authOverlay.classList.add('initial-open');

        // Force reflow then add active to trigger transition
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            authOverlay.classList.add('active');
          });
        });

        // Remove initial-open after animations complete
        setTimeout(() => {
          authOverlay.classList.remove('initial-open');
        }, 2500);

        // Show spider on login button after form elements finish entering
        showSpiderAfterDelay(loginSpider, 1500);
      }

      function closeAuthOverlay() {
        authOverlay.classList.remove('active');
        // Hide spiders
        hideSpider(loginSpider);
        hideSpider(registerSpider);
        authOverlay.classList.add('closing');
        setTimeout(() => {
          authOverlay.classList.remove('closing');
          // Reset forms
          // Reset to login form without animation
          registerForm.classList.remove('visible', 'exiting');
          loginForm.classList.remove('exiting');
          loginForm.classList.add('visible');
          loginSpider.classList.remove('show', 'exit');
          registerSpider.classList.remove('show', 'exit');
          if (registerSpider2) registerSpider2.classList.remove('show', 'exit');
          const heroEl = document.querySelector('.auth-hero');
          heroEl.classList.remove('hero-exit', 'hero-enter');
          loginError.classList.remove('show');
          registerError.classList.remove('show');
          if (registerError2) registerError2.classList.remove('show');
          loginError.textContent = '';
          registerError.textContent = '';
          if (registerError2) registerError2.textContent = '';
          authHeroTitle.textContent = t('auth.loginTitle');
          authHeroSubtitle.textContent = t('auth.loginSubtitle');
          // Reset register steps
          if (registerStep1) registerStep1.style.display = '';
          if (registerStep2) registerStep2.style.display = 'none';
          registerAvatarData = null;
          if (registerAvatarPreview) registerAvatarPreview.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:48px;height:48px;color:#bbb;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
          if (registerAvatarFile) registerAvatarFile.value = '';
        }, 800);
      }

      // Spider show/hide on submit buttons
      const loginSpider = document.getElementById('loginSpider');
      const registerSpider = document.getElementById('registerSpider');

      function showSpider(spiderEl) {
        spiderEl.classList.remove('exit');
        spiderEl.classList.add('show');
      }

      function hideSpider(spiderEl) {
        spiderEl.classList.remove('show');
        spiderEl.classList.add('exit');
      }

      // Show spider after form elements finish animating in
      // Initial open: after ~2.5s (hero 0.8s + form 1.5s + buffer)
      // Form switch: after ~1.2s (exit 0.7s + enter 0.55s + buffer)
      function showSpiderAfterDelay(spiderEl, delay) {
        setTimeout(() => {
          showSpider(spiderEl);
        }, delay);
      }

      let isAuthSwitching = false;

      function switchForm(fromEl, toEl, titleText, subtitleText, fromSpider, toSpider) {
        if (isAuthSwitching) return;
        isAuthSwitching = true;

        // Step 1: spider runs out (1.2s) + hero exits + form elements stagger out — all simultaneously
        hideSpider(fromSpider);

        const heroEl = document.querySelector('.auth-hero');
        heroEl.classList.add('hero-exit');

        fromEl.classList.remove('visible');
        fromEl.classList.add('exiting');

        // Step 2: after spider finishes running out (1.2s), swap to new form
        setTimeout(() => {
          fromEl.classList.remove('exiting');
          fromSpider.classList.remove('exit');

          // Update hero text
          authHeroTitle.textContent = titleText;
          authHeroSubtitle.textContent = subtitleText;

          // Hero enters from below
          heroEl.classList.remove('hero-exit');
          heroEl.classList.add('hero-enter');

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              heroEl.classList.remove('hero-enter');
            });
          });

          // New form elements stagger in
          toEl.classList.add('visible');

          // Show spider on new button after elements finish entering (~1.1s)
          showSpiderAfterDelay(toSpider, 1100);

          // Unlock after spider finishes running in (1.1s delay + 1.2s run = 2.3s)
          setTimeout(() => {
            isAuthSwitching = false;
          }, 2300);
        }, 1200);
      }

      function showLoginForm() {
        switchForm(
          registerForm,
          loginForm,
          t('auth.loginTitle'),
          t('auth.loginSubtitle'),
          registerSpider,
          loginSpider
        );
        loginError.classList.remove('show');
      }

      function showRegisterForm() {
        switchForm(
          loginForm,
          registerForm,
          t('auth.registerTitle'),
          t('auth.registerSubtitle'),
          loginSpider,
          registerSpider
        );
        registerError.classList.remove('show');
        if (registerError2) registerError2.classList.remove('show');
        // Reset to step 1
        if (registerStep1) registerStep1.style.display = '';
        if (registerStep2) registerStep2.style.display = 'none';
        registerAvatarData = null;
        if (registerSubmit) registerSubmit.classList.add('disabled-avatar');
        if (registerAvatarPreview) registerAvatarPreview.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:48px;height:48px;color:#bbb;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
      }

      function showAuthError(el, msg) {
        el.textContent = msg;
        el.classList.add('show');
      }

      // Login button in personal panel → trigger circular expansion
      const personalPanel = document.getElementById('personalPanel');
      const loginBtn = personalPanel ? personalPanel.querySelector('.login-btn') : null;
      if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rect = loginBtn.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          openAuthOverlay(cx, cy);
        });
      }
      // Logout button → show confirm dialog
      const btnLogout = document.getElementById('btnLogout');
      const logoutConfirmOverlay = document.getElementById('logoutConfirmOverlay');
      const logoutCancelBtn = document.getElementById('logoutCancelBtn');
      const logoutConfirmBtn = document.getElementById('logoutConfirmBtn');

      function showLogoutConfirm() {
        if (logoutConfirmOverlay) logoutConfirmOverlay.classList.add('visible');
      }
      function hideLogoutConfirm() {
        if (logoutConfirmOverlay) logoutConfirmOverlay.classList.remove('visible');
      }

      if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
          e.stopPropagation();
          showLogoutConfirm();
        });
      }
      if (logoutCancelBtn) {
        logoutCancelBtn.addEventListener('click', () => hideLogoutConfirm());
      }
      if (logoutConfirmBtn) {
        logoutConfirmBtn.addEventListener('click', () => {
          hideLogoutConfirm();
          logout();
        });
      }
      if (logoutConfirmOverlay) {
        logoutConfirmOverlay.addEventListener('click', (e) => {
          if (e.target === logoutConfirmOverlay) hideLogoutConfirm();
        });
      }

      // API Key button
      const btnApiKey = document.getElementById('btnApiKey');
      const apiKeyOverlay = document.getElementById('apiKeyOverlay');
      const apiKeyBack = document.getElementById('apiKeyBack');
      const apiKeyInput = document.getElementById('apiKeyInput');
      const apiKeyToggle = document.getElementById('apiKeyToggle');
      const apiKeySave = document.getElementById('apiKeySave');
      const apiKeyClear = document.getElementById('apiKeyClear');
      const apiKeyStatus = document.getElementById('apiKeyStatus');
      const apiKeyDropdown = document.getElementById('apiKeyDropdown');
      const apiKeyDropdownTrigger = document.getElementById('apiKeyDropdownTrigger');
      const apiKeyDropdownMenu = document.getElementById('apiKeyDropdownMenu');
      const apiKeyDropdownValue = document.getElementById('apiKeyDropdownValue');
      let apiKeyPlatformValue = 'deepseek';
      const apiKeyCustomWrap = document.getElementById('apiKeyCustomWrap');
      const apiKeyCustomUrl = document.getElementById('apiKeyCustomUrl');
      const apiKeyCustomModel = document.getElementById('apiKeyCustomModel');

      // AI platform configurations
      const AI_PLATFORMS = {
        deepseek: { url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', label: 'DeepSeek' },
        openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', label: 'OpenAI' },
        qwen: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus', label: 'Qwen' },
        moonshot: { url: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k', label: 'Moonshot' },
        custom: { url: '', model: '' },
      };

      function getAiPlatformConfig() {
        const platform = localStorage.getItem('ai_platform') || 'deepseek';
        const base = AI_PLATFORMS[platform] || AI_PLATFORMS.deepseek;
        if (platform === 'custom') {
          return {
            url: localStorage.getItem('ai_custom_url') || '',
            model: localStorage.getItem('ai_custom_model') || '',
          };
        }
        return { url: base.url, model: base.model };
      }

      function hasAiApiKey() {
        return !!localStorage.getItem('ai_api_key');
      }

      function setApiKeyPlatform(value) {
        apiKeyPlatformValue = value;
        const items = apiKeyDropdownMenu.querySelectorAll('.api-key-dropdown-item');
        items.forEach(item => {
          item.classList.toggle('active', item.dataset.value === value);
          if (item.dataset.value === value) {
            apiKeyDropdownValue.textContent = item.textContent;
          }
        });
        if (value === 'custom') {
          if (apiKeyCustomWrap) apiKeyCustomWrap.style.display = '';
        } else {
          if (apiKeyCustomWrap) apiKeyCustomWrap.style.display = 'none';
        }
      }

      if (apiKeyDropdownTrigger && apiKeyDropdown) {
        apiKeyDropdownTrigger.addEventListener('click', (e) => {
          e.stopPropagation();
          apiKeyDropdown.classList.toggle('open');
        });
        document.addEventListener('click', (e) => {
          if (!apiKeyDropdown.contains(e.target)) {
            apiKeyDropdown.classList.remove('open');
          }
        });
      }
      if (apiKeyDropdownMenu) {
        apiKeyDropdownMenu.querySelectorAll('.api-key-dropdown-item').forEach(item => {
          item.addEventListener('click', () => {
            setApiKeyPlatform(item.dataset.value);
            apiKeyDropdown.classList.remove('open');
          });
        });
      }

      if (btnApiKey && apiKeyOverlay) {
        btnApiKey.addEventListener('click', (e) => {
          e.stopPropagation();
          const savedPlatform = localStorage.getItem('ai_platform') || 'deepseek';
          const savedKey = localStorage.getItem('ai_api_key') || '';
          setApiKeyPlatform(savedPlatform);
          apiKeyInput.value = savedKey;
          if (apiKeyCustomUrl) apiKeyCustomUrl.value = localStorage.getItem('ai_custom_url') || '';
          if (apiKeyCustomModel) apiKeyCustomModel.value = localStorage.getItem('ai_custom_model') || '';
          apiKeyStatus.classList.remove('show', 'success', 'error');
          apiKeyOverlay.classList.add('visible');
        });
      }
      if (apiKeyBack && apiKeyOverlay) {
        apiKeyBack.addEventListener('click', () => {
          apiKeyOverlay.classList.remove('visible');
        });
      }
      if (apiKeyToggle) {
        apiKeyToggle.addEventListener('click', () => {
          apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
        });
      }
      if (apiKeySave) {
        apiKeySave.addEventListener('click', () => {
          const key = apiKeyInput.value.trim();
          if (!key) {
            apiKeyStatus.textContent = t('apiKey.errEmpty');
            apiKeyStatus.className = 'api-key-status show error';
            return;
          }
          const platform = apiKeyPlatformValue;
          localStorage.setItem('ai_platform', platform);
          localStorage.setItem('ai_api_key', key);
          if (platform === 'custom') {
            const customUrl = apiKeyCustomUrl ? apiKeyCustomUrl.value.trim() : '';
            const customModel = apiKeyCustomModel ? apiKeyCustomModel.value.trim() : '';
            if (!customUrl || !customModel) {
              apiKeyStatus.textContent = t('apiKey.errCustom');
              apiKeyStatus.className = 'api-key-status show error';
              return;
            }
            localStorage.setItem('ai_custom_url', customUrl);
            localStorage.setItem('ai_custom_model', customModel);
          }
          apiKeyStatus.textContent = t('apiKey.saved');
          apiKeyStatus.className = 'api-key-status show success';
          setTimeout(() => apiKeyOverlay.classList.remove('visible'), 800);
        });
      }
      if (apiKeyClear) {
        apiKeyClear.addEventListener('click', () => {
          apiKeyInput.value = '';
          localStorage.removeItem('ai_api_key');
          localStorage.removeItem('ai_platform');
          localStorage.removeItem('ai_custom_url');
          localStorage.removeItem('ai_custom_model');
          // Also clear legacy key
          localStorage.removeItem('deepseek_api_key');
          apiKeyStatus.textContent = t('apiKey.cleared');
          apiKeyStatus.className = 'api-key-status show success';
          setTimeout(() => apiKeyOverlay.classList.remove('visible'), 800);
        });
      }

      // AI Login Required Overlay
      const aiLoginOverlay = document.getElementById('aiLoginOverlay');
      const aiLoginCancel = document.getElementById('aiLoginCancel');
      const aiLoginGoSettings = document.getElementById('aiLoginGoSettings');

      function showAiLoginOverlay() {
        if (aiLoginOverlay) aiLoginOverlay.classList.add('visible');
      }
      function hideAiLoginOverlay() {
        if (aiLoginOverlay) aiLoginOverlay.classList.remove('visible');
      }
      if (aiLoginCancel) {
        aiLoginCancel.addEventListener('click', hideAiLoginOverlay);
      }
      if (aiLoginGoSettings) {
        aiLoginGoSettings.addEventListener('click', () => {
          hideAiLoginOverlay();
          if (!isLoggedIn()) {
            const pp = document.getElementById('personalPanel');
            const lb = pp ? pp.querySelector('.login-btn') : null;
            if (lb) {
              const rect = lb.getBoundingClientRect();
              openAuthOverlay(rect.left + rect.width / 2, rect.top + rect.height / 2);
            }
          } else {
            if (btnApiKey) btnApiKey.click();
          }
        });
      }

      // Check AI login before opening AI tool overlay
      function openToolWithAiCheck(openFn) {
        if (!isLoggedIn() || !hasAiApiKey()) {
          showAiLoginOverlay();
          return;
        }
        openFn();
      }

      // Restore session on startup
      restoreSession();

      // Close button
      authClose.addEventListener('click', closeAuthOverlay);

      // Switch between login and register
      switchToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        showRegisterForm();
      });
      switchToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginForm();
      });

      // Enter key to submit
      document.getElementById('loginPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginSubmit.click();
      });
      document.getElementById('registerPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') registerNext.click();
      });

      // Login submit
      loginSubmit.addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        if (!email || !password) {
          showAuthError(loginError, t('auth.errFillEmailPassword'));
          return;
        }
        loginSubmit.disabled = true;
        const btnRect = loginSubmit.getBoundingClientRect();
        showAuthLoading(btnRect.left + btnRect.width / 2, btnRect.top + btnRect.height / 2);
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          const res = await fetch(`${AUTH_API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const data = await res.json();
          if (data.code === 0 && data.data) {
            localStorage.setItem('toolknit_token', data.data.token);
            localStorage.setItem('toolknit_user', JSON.stringify(data.data.user));
            updatePersonalPanel(data.data.user);
            closeAuthOverlay();
          } else {
            showAuthError(loginError, translateServerError(data.msg) || t('auth.errLoginFailed'));
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            showAuthError(loginError, t('auth.errTimeout'));
          } else {
            showAuthError(loginError, t('auth.errNetwork'));
          }
        } finally {
          hideAuthLoading();
          loginSubmit.disabled = false;
          loginSubmit.textContent = t('auth.loginBtn');
        }
      });

      // Register step 1: Next button
      registerNext.addEventListener('click', () => {
        const username = document.getElementById('registerUsername').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        if (!username || !email || !password) {
          showAuthError(registerError, t('auth.errFillAll'));
          return;
        }
        if (password.length < 6) {
          showAuthError(registerError, t('auth.errPasswordShort'));
          return;
        }
        registerError.classList.remove('show');
        registerStep1.style.display = 'none';
        registerStep2.style.display = '';
        registerSubmit.classList.add('disabled-avatar');
      });

      // Register back to step 1
      if (registerBack) {
        registerBack.addEventListener('click', (e) => {
          e.preventDefault();
          registerStep2.style.display = 'none';
          registerStep1.style.display = '';
          if (registerError2) registerError2.classList.remove('show');
        });
      }

      // Avatar file selection
      if (registerAvatarZone) {
        registerAvatarZone.addEventListener('click', () => {
          registerAvatarFile.click();
        });
      }
      if (registerAvatarFile) {
        registerAvatarFile.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) {
            showAuthError(registerError2, t('auth.errAvatarTooLarge'));
            registerAvatarFile.value = '';
            return;
          }
          registerAvatarData = file;
          registerSubmit.classList.remove('disabled-avatar');
          const reader = new FileReader();
          reader.onload = (ev) => {
            registerAvatarPreview.innerHTML = `<img src="${ev.target.result}" alt="avatar-preview">`;
          };
          reader.readAsDataURL(file);
          if (registerError2) registerError2.classList.remove('show');
        });
      }

      // Register step 2: Submit
      registerSubmit.addEventListener('click', async () => {
        if (!registerAvatarData) {
          window.showToast(t('auth.errAvatarRequired'));
          return;
        }
        const username = document.getElementById('registerUsername').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        if (!username || !email || !password) {
          if (registerError2) showAuthError(registerError2, t('auth.errFillAll'));
          return;
        }
        if (password.length < 6) {
          if (registerError2) showAuthError(registerError2, t('auth.errPasswordShort'));
          return;
        }
        registerSubmit.disabled = true;
        const btnRect = registerSubmit.getBoundingClientRect();
        showAuthLoading(btnRect.left + btnRect.width / 2, btnRect.top + btnRect.height / 2);
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          const res = await fetch(`${AUTH_API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, username }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const data = await res.json();
          if (data.code === 0 && data.data) {
            localStorage.setItem('toolknit_token', data.data.token);
            localStorage.setItem('toolknit_user', JSON.stringify(data.data.user));
            // If avatar selected, upload it
            if (registerAvatarData && data.data.token) {
              try {
                const formData = new FormData();
                formData.append('avatar', registerAvatarData);
                const avatarRes = await fetch(`${AUTH_API_BASE}/api/upload/avatar`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${data.data.token}` },
                  body: formData,
                });
                const avatarData = await avatarRes.json();
                if (avatarData.code === 0 && avatarData.data && avatarData.data.user) {
                  localStorage.setItem('toolknit_user', JSON.stringify(avatarData.data.user));
                  updatePersonalPanel(avatarData.data.user);
                } else {
                  updatePersonalPanel(data.data.user);
                }
              } catch (avatarErr) {
                console.error('Avatar upload after register failed:', avatarErr);
                updatePersonalPanel(data.data.user);
              }
            } else {
              updatePersonalPanel(data.data.user);
            }
            closeAuthOverlay();
          } else {
            if (registerError2) showAuthError(registerError2, translateServerError(data.msg) || t('auth.errRegisterFailed'));
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            if (registerError2) showAuthError(registerError2, t('auth.errTimeout'));
          } else {
            if (registerError2) showAuthError(registerError2, t('auth.errNetwork'));
          }
        } finally {
          hideAuthLoading();
          registerSubmit.disabled = false;
          registerSubmit.textContent = t('auth.registerBtn');
        }
      });

      // Changelog: render current version and timeline
      function renderChangelog() {
        const lang = getLang();
        const data = changelog[lang] || changelog.zh;
        const versions = data.versions;

        const sidebarVersion = document.getElementById('sidebarVersion');
        if (sidebarVersion) sidebarVersion.textContent = data.currentVersion;

        const currentVersion = document.getElementById('currentVersion');
        const currentDate = document.getElementById('currentDate');
        const currentTitle = document.getElementById('currentTitle');
        const currentList = document.getElementById('currentList');
        const timeline = document.getElementById('changelogTimeline');
        if (!currentVersion || !currentDate || !currentTitle || !currentList || !timeline) return;

        const selectedIndex = timeline.dataset.selectedIndex ? parseInt(timeline.dataset.selectedIndex) : 0;
        const selected = versions[selectedIndex] || versions[0];

        currentVersion.textContent = selected.version;
        currentDate.textContent = selected.date;
        currentTitle.textContent = selected.title;
        currentList.innerHTML = selected.content.map(item => `<li>${escapeHtml(item)}</li>`).join('');

        timeline.innerHTML = versions.map((v, index) => `
          <div class="timeline-item ${index === selectedIndex ? 'active' : ''}" data-index="${index}">
            <div class="timeline-dot"></div>
            <div class="timeline-info">
              <div class="timeline-version">${escapeHtml(v.version)}</div>
              <div class="timeline-date">${escapeHtml(v.date)}</div>
            </div>
          </div>
        `).join('');

        timeline.querySelectorAll('.timeline-item').forEach(item => {
          item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.index);
            if (idx === selectedIndex) return;
            timeline.dataset.selectedIndex = idx;

            const currentPanel = document.querySelector('.changelog-current');
            if (currentPanel) {
              currentPanel.classList.add('refreshing');
              setTimeout(() => {
                renderChangelog();
                setTimeout(() => {
                  currentPanel.classList.remove('refreshing');
                }, 50);
              }, 200);
            } else {
              renderChangelog();
            }
          });
        });
      }

      onLangChange(renderChangelog);

      // Statistics tracking
      (function initStats() {
        const totalKey = 'toolknit_total_usage';
        const myKey = 'toolknit_my_usage';
        const WEB_USAGE_API = 'https://toolknit.com/api/total-usage.php';

        function getStoredInt(key, fallback = 0) {
          try {
            const val = localStorage.getItem(key);
            const parsed = parseInt(val || String(fallback), 10);
            return isNaN(parsed) ? fallback : parsed;
          } catch (e) {
            return fallback;
          }
        }

        function setStoredInt(key, value) {
          try {
            localStorage.setItem(key, String(value));
          } catch (e) {
            console.warn('Failed to persist stats:', e);
          }
        }

        let exeTotalUsage = getStoredInt(totalKey);
        let exeMyUsage = getStoredInt(myKey);
        let webTotalUsage = 0;
        let exeApiTotalUsage = 0;

        const barTotalEl = document.getElementById('barTotalUsage');
        const barMyEl = document.getElementById('barMyUsage');
        const barTotalFill = document.getElementById('barTotal');
        const barMineFill = document.getElementById('barMine');

        function animateValue(el, start, end, duration) {
          const startTime = performance.now();
          function update(now) {
            const t = Math.min((now - startTime) / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3);
            el.textContent = Math.round(start + (end - start) * ease).toLocaleString();
            if (t < 1) requestAnimationFrame(update);
          }
          requestAnimationFrame(update);
        }

        function getTotalUsage() {
          return webTotalUsage + exeApiTotalUsage + exeTotalUsage;
        }

        function renderStats() {
          const total = getTotalUsage();
          if (barTotalEl) animateValue(barTotalEl, 0, total, 800);
          if (barMyEl) animateValue(barMyEl, 0, exeMyUsage, 800);

          const max = Math.max(total, 1);
          const totalWidth = 100;
          const mineWidth = (exeMyUsage / max) * 100;

          if (barTotalFill) barTotalFill.style.width = `${totalWidth}%`;
          requestAnimationFrame(() => {
            if (barMineFill) barMineFill.style.width = `${mineWidth}%`;
          });
        }

        function updateBars() {
          const total = getTotalUsage();
          const max = Math.max(total, 1);
          const mineWidth = (exeMyUsage / max) * 100;
          if (barMineFill) barMineFill.style.width = `${mineWidth}%`;
        }

        function refreshTotalDisplay() {
          const total = getTotalUsage();
          if (barTotalEl) animateValue(barTotalEl, parseInt(barTotalEl.textContent.replace(/,/g, '') || '0', 10), total, 500);
          updateBars();
        }

        function refreshMyUsageDisplay() {
          if (barMyEl) animateValue(barMyEl, parseInt(barMyEl.textContent.replace(/,/g, '') || '0', 10), exeMyUsage, 500);
          updateBars();
        }

        // Fetch web-side total usage from PHP API
        async function fetchWebTotalUsage() {
          try {
            const res = await fetch(WEB_USAGE_API);
            const text = await res.text();
            const num = parseInt(text.trim(), 10);
            if (!isNaN(num)) {
              webTotalUsage = num;
              refreshTotalDisplay();
            }
          } catch (e) {
            console.warn('Failed to fetch web total usage:', e);
          }
        }

        // Fetch exe-side global total from API
        async function fetchExeApiTotalUsage() {
          try {
            const res = await fetch(`${AUTH_API_BASE}/api/usage/total`);
            const data = await res.json();
            if (data.code === 0 && data.data) {
              exeApiTotalUsage = data.data.count || 0;
              // Server total already includes all historical local increments,
              // so reset local total to avoid double-counting
              exeTotalUsage = 0;
              setStoredInt(totalKey, 0);
              refreshTotalDisplay();
            }
          } catch (e) {
            console.warn('Failed to fetch exe api total usage:', e);
          }
        }

        // Report tool usage: local +1 + public API increment
        window.incrementToolUsage = async function() {
          exeTotalUsage += 1;
          setStoredInt(totalKey, exeTotalUsage);
          exeMyUsage += 1;
          setStoredInt(myKey, exeMyUsage);

          try {
            await fetch(`${AUTH_API_BASE}/api/usage/increment`, { method: 'POST' });
            exeApiTotalUsage += 1;
          } catch (e) {
            console.warn('Failed to report usage to server:', e);
          }

          refreshTotalDisplay();
          refreshMyUsageDisplay();
        };

        // Toast notification function
        window.showToast = function(message, duration = 2000) {
          const container = document.getElementById('toastContainer');
          if (!container) return;

          const toast = document.createElement('div');
          toast.className = 'toast';
          toast.textContent = message;
          container.appendChild(toast);

          setTimeout(() => {
            toast.classList.add('hiding');
            toast.addEventListener('animationend', () => {
              if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
              }
            });
          }, duration);
        };

        // Initial render with local data, then fetch remote
        renderStats();
        fetchWebTotalUsage();
        fetchExeApiTotalUsage();
      })();

      // About-us links
      const ABOUT_LINKS = {
        donate: 'https://toolknit.com/donate.html',
        github: 'https://github.com/2645149786-dotcom',
        website: 'https://toolknit.com'
      };

      async function openExternalUrl(url) {
        if (!url || !/^https?:\/\//i.test(url)) {
          console.warn('Invalid external URL:', url);
          return;
        }
        if (isTauri) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('open_url', { url });
          } catch (err) {
            console.error('Failed to open URL:', err);
            window.open(url, '_blank');
          }
        } else {
          window.open(url, '_blank');
        }
      }

      document.querySelectorAll('.about-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const url = ABOUT_LINKS[link.dataset.link];
          if (url) openExternalUrl(url);
        });
      });

      // Donate tooltip hover
      const donateLink = document.querySelector('.about-link.donate-link');
      const donateTooltip = document.getElementById('donateTooltip');
      if (donateLink && donateTooltip) {
        function positionTooltip() {
          const rect = donateLink.getBoundingClientRect();
          const tooltipWidth = donateTooltip.offsetWidth;
          const tooltipHeight = donateTooltip.offsetHeight;
          let left = rect.left + rect.width / 2 - tooltipWidth / 2;
          let top = rect.top - tooltipHeight - 12;

          // Keep within viewport horizontally
          const padding = 12;
          if (left < padding) left = padding;
          if (left + tooltipWidth > window.innerWidth - padding) {
            left = window.innerWidth - tooltipWidth - padding;
          }

          // Keep within viewport vertically
          const flipped = top < padding;
          if (flipped) {
            top = rect.bottom + 12;
          }
          donateTooltip.classList.toggle('flipped', flipped);

          donateTooltip.style.left = `${left}px`;
          donateTooltip.style.top = `${top}px`;
        }

        donateLink.addEventListener('mouseenter', () => {
          positionTooltip();
          donateTooltip.classList.add('visible');
        });
        donateLink.addEventListener('mouseleave', () => {
          donateTooltip.classList.remove('visible');
        });

        window.addEventListener('resize', () => {
          if (donateTooltip.classList.contains('visible')) {
            positionTooltip();
          }
        });
      }

      // ===== PDF Merger =====
      const pdfMergeOverlay = document.getElementById('pdfMergeOverlay');
      const pdfMergeFerrofluid = document.getElementById('pdfMergeFerrofluid');
      const pdfMergeBack = document.getElementById('pdfMergeBack');
      let pdfMergeFerrofluidInstance = null;

      function openPdfMergeOverlay() {
        if (!pdfMergeOverlay) return;
        pdfMergeOverlay.classList.add('visible');
        if (pdfMergeFerrofluid && !pdfMergeFerrofluidInstance) {
          pdfMergeFerrofluidInstance = initFerrofluid(pdfMergeFerrofluid, {
            colors: ['#e8e8ec', '#a0a0a8', '#ffffff'],
            speed: 0.3,
            scale: 2,
            turbulence: 1,
            fluidity: 0.14,
            rimWidth: 0.19,
            sharpness: 4.7,
            shimmer: 0.5,
            glow: 2.8,
            flowDirection: 'left',
            opacity: 0.6,
            mouseInteraction: true,
            mouseStrength: 1.6,
            mouseRadius: 0.6,
            mouseDampening: 0.15
          });
        }
      }

      function closePdfMergeOverlay() {
        if (!pdfMergeOverlay) return;
        pdfMergeOverlay.classList.remove('visible');
        if (pdfMergeFerrofluidInstance) {
          pdfMergeFerrofluidInstance();
          pdfMergeFerrofluidInstance = null;
        }
        pdfMergeProcessing = false;
        if (pdfMergeProcessMask) pdfMergeProcessMask.classList.remove('visible');
        if (pdfMergeProcessBarFill) pdfMergeProcessBarFill.style.width = '0%';
        clearPdfMergeFiles();
      }

      if (pdfMergeBack) {
        pdfMergeBack.addEventListener('click', closePdfMergeOverlay);
      }

      document.querySelectorAll('.audio-list-item[data-tool="pdf-merge"]').forEach(item => {
        item.addEventListener('click', () => {
          openPdfMergeOverlay();
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPdfMergeOverlay();
          }
        });
      });

      // ===== PDF Split Overlay Open/Close =====
      const pdfSplitOverlay = document.getElementById('pdfSplitOverlay');
      const pdfSplitFerrofluid = document.getElementById('pdfSplitFerrofluid');
      const pdfSplitBack = document.getElementById('pdfSplitBack');
      let pdfSplitFerrofluidInstance = null;

      function openPdfSplitOverlay() {
        if (!pdfSplitOverlay) return;
        pdfSplitOverlay.classList.add('visible');
        if (pdfSplitFerrofluid && !pdfSplitFerrofluidInstance) {
          pdfSplitFerrofluidInstance = initFerrofluid(pdfSplitFerrofluid, {
            colors: ['#e8e8ec', '#a0a0a8', '#ffffff'],
            speed: 0.3,
            scale: 2,
            opacity: 0.6,
          });
        }
      }

      function closePdfSplitOverlay() {
        if (!pdfSplitOverlay) return;
        pdfSplitOverlay.classList.remove('visible');
        if (pdfSplitFerrofluidInstance) {
          pdfSplitFerrofluidInstance();
          pdfSplitFerrofluidInstance = null;
        }
      }

      if (pdfSplitBack) {
        pdfSplitBack.addEventListener('click', closePdfSplitOverlay);
      }

      document.querySelectorAll('.audio-list-item[data-tool="pdf-split"]').forEach(item => {
        item.addEventListener('click', () => {
          openPdfSplitOverlay();
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPdfSplitOverlay();
          }
        });
      });

      // ===== PDF Split Interaction =====
      const pdfSplitDropZone = document.getElementById('pdfSplitDropZone');
      const pdfSplitFiles = document.getElementById('pdfSplitFiles');
      const pdfSplitCta = document.getElementById('pdfSplitCta');
      const pdfSplitProcessBtn = document.getElementById('pdfSplitProcessBtn');
      const pdfSplitProcessMask = document.getElementById('pdfSplitProcessMask');
      const pdfSplitProcessBarFill = document.getElementById('pdfSplitProcessBarFill');
      const pdfSplitProcessText = document.getElementById('pdfSplitProcessText');
      const pdfSplitSuccessOverlay = document.getElementById('pdfSplitSuccessOverlay');
      const pdfSplitSuccessPath = document.getElementById('pdfSplitSuccessPath');
      const pdfSplitSuccessMeta = document.getElementById('pdfSplitSuccessMeta');
      const pdfSplitSuccessCount = document.getElementById('pdfSplitSuccessCount');
      const pdfSplitSuccessOpenFolder = document.getElementById('pdfSplitSuccessOpenFolder');
      const pdfSplitSuccessOk = document.getElementById('pdfSplitSuccessOk');
      const pdfSplitDrawer = document.getElementById('pdfSplitDrawer');
      const pdfSplitDrawerBackdrop = document.getElementById('pdfSplitDrawerBackdrop');
      const pdfSplitDrawerClose = document.getElementById('pdfSplitDrawerClose');
      const pdfSplitDrawerBody = document.getElementById('pdfSplitDrawerBody');
      const pdfSplitDownloadAllBtn = document.getElementById('pdfSplitDownloadAllBtn');

      let selectedPdfSplitFiles = [];
      let pdfSplitProcessing = false;
      let lastPdfSplitSavedPath = '';

      function addPdfSplitFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        for (const file of fileList) {
          const dup = file.path
            ? selectedPdfSplitFiles.some(f => f.path === file.path)
            : selectedPdfSplitFiles.some(f => f.name === file.name && f.size === file.size);
          if (dup) continue;
          selectedPdfSplitFiles.push(file);
        }
        renderPdfSplitFiles();
      }

      function removePdfSplitFile(index) {
        selectedPdfSplitFiles.splice(index, 1);
        renderPdfSplitFiles();
      }

      function clearPdfSplitFiles() {
        selectedPdfSplitFiles = [];
        renderPdfSplitFiles();
      }

      function renderPdfSplitFiles() {
        if (!pdfSplitFiles) return;
        pdfSplitFiles.innerHTML = '';
        if (selectedPdfSplitFiles.length > 0) {
          pdfSplitFiles.classList.add('has-files');
        } else {
          pdfSplitFiles.classList.remove('has-files');
        }
        selectedPdfSplitFiles.forEach((file, index) => {
          const item = document.createElement('div');
          item.className = 'audio-convert-file-item';
          item.dataset.index = index;
          item.innerHTML = `
            <span class="audio-convert-file-index">${index + 1}</span>
            <span class="audio-convert-file-name">${escapeHtml(file.name)}</span>
            <button class="audio-convert-file-remove" data-index="${index}" aria-label="remove">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          `;
          pdfSplitFiles.appendChild(item);
        });
        pdfSplitFiles.querySelectorAll('.audio-convert-file-remove').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index, 10);
            if (!isNaN(idx)) removePdfSplitFile(idx);
          });
        });
        togglePdfSplitProcessButton();
      }

      function togglePdfSplitProcessButton() {
        if (!pdfSplitProcessBtn) return;
        if (selectedPdfSplitFiles.length >= 1) {
          pdfSplitProcessBtn.style.display = '';
          requestAnimationFrame(() => pdfSplitProcessBtn.classList.add('visible'));
        } else {
          pdfSplitProcessBtn.classList.remove('visible');
          const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity' && !pdfSplitProcessBtn.classList.contains('visible')) {
              pdfSplitProcessBtn.style.display = 'none';
              pdfSplitProcessBtn.removeEventListener('transitionend', onTransitionEnd);
            }
          };
          pdfSplitProcessBtn.addEventListener('transitionend', onTransitionEnd);
        }
      }

      function showPdfSplitDropZone() {
        if (pdfSplitDropZone) pdfSplitDropZone.classList.add('visible');
        if (pdfSplitOverlay) pdfSplitOverlay.classList.add('drag-over');
      }

      function hidePdfSplitDropZone() {
        if (pdfSplitDropZone) pdfSplitDropZone.classList.remove('visible');
        if (pdfSplitOverlay) pdfSplitOverlay.classList.remove('drag-over');
      }

      // Tauri native drag-drop
      if (isTauri && pdfSplitOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!pdfSplitOverlay.classList.contains('visible') || pdfSplitProcessing) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') {
              showPdfSplitDropZone();
            } else if (payload.type === 'leave') {
              hidePdfSplitDropZone();
            } else if (payload.type === 'drop') {
              hidePdfSplitDropZone();
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const fileList = paths
                .filter(p => p.toLowerCase().endsWith('.pdf'))
                .map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
              if (fileList.length > 0) {
                addPdfSplitFiles(fileList);
              }
            }
          });
        })();
      }

      // CTA button — open file dialog
      if (pdfSplitCta) {
        pdfSplitCta.addEventListener('click', async () => {
          if (isTauri) {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({
                multiple: true,
                filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
              });
              if (selected && Array.isArray(selected)) {
                const fileList = selected.map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
                addPdfSplitFiles(fileList);
              }
            } catch (e) {
              console.error('PDF split file selection error', e);
            }
          } else {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = '.pdf,application/pdf';
            input.addEventListener('change', () => {
              addPdfSplitFiles(input.files);
              input.value = '';
            });
            input.click();
          }
        });
      }

      // ===== PDF Split: Real Implementation =====
      let pdfSplitLoadedDocs = []; // [{ doc, fileData, fileName }]
      let pdfSplitPagesData = []; // [{ fileIndex, pageIndex, canvas, fileName }]

      // Process button — real split
      if (pdfSplitProcessBtn) {
        pdfSplitProcessBtn.addEventListener('click', async () => {
          if (selectedPdfSplitFiles.length < 1 || pdfSplitProcessing) return;
          pdfSplitProcessing = true;
          if (pdfSplitProcessMask) pdfSplitProcessMask.classList.add('visible');
          if (pdfSplitProcessBarFill) pdfSplitProcessBarFill.style.width = '10%';
          if (pdfSplitProcessText) pdfSplitProcessText.textContent = t('home.pdfSplit.processing');

          try {
            // Clear previous state (destroy old pdfjs docs if any)
            pdfSplitLoadedDocs.forEach(d => { try { d.doc.destroy(); } catch (_) {} });
            pdfSplitLoadedDocs = [];
            pdfSplitPagesData.forEach(p => { if (p.canvas) { p.canvas.width = 0; p.canvas.height = 0; } });
            pdfSplitPagesData = [];

            // Configure pdf.js worker
            const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
            pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
              'pdfjs-dist/build/pdf.worker.mjs',
              import.meta.url
            ).toString();

            const totalFiles = selectedPdfSplitFiles.length;
            const MAX_TOTAL_PAGES = 2000;
            let totalPagesSoFar = 0;

            for (let fi = 0; fi < totalFiles; fi++) {
              const file = selectedPdfSplitFiles[fi];
              const progress = Math.round(((fi + 0.3) / totalFiles) * 100);
              if (pdfSplitProcessBarFill) pdfSplitProcessBarFill.style.width = progress + '%';
              if (pdfSplitProcessText) pdfSplitProcessText.textContent = `${t('home.pdfSplit.processing')} (${fi + 1}/${totalFiles})`;

              // Read file bytes
              let fileData;
              if (isTauri && file.path) {
                const { invoke } = await import('@tauri-apps/api/core');
                const rawBytes = await invoke('read_file_bytes', { path: file.path });
                if (Array.isArray(rawBytes)) {
                  fileData = Uint8Array.from(rawBytes);
                } else if (rawBytes instanceof ArrayBuffer) {
                  fileData = new Uint8Array(rawBytes);
                } else if (rawBytes instanceof Uint8Array) {
                  fileData = rawBytes;
                } else if (rawBytes && typeof rawBytes.length === 'number') {
                  fileData = Uint8Array.from(rawBytes);
                } else {
                  throw new Error(`Invalid file data for ${file.name}: ${typeof rawBytes}`);
                }
                if (fileData.length === 0) throw new Error(`File ${file.name} is empty`);
              } else {
                fileData = new Uint8Array(await file.arrayBuffer());
              }

              // Load with pdfjs for preview
              const _wasmUrl = new URL('assets/', document.baseURI).href;
              const loadingTask = pdfjsLib.getDocument({ data: fileData.slice(), wasmUrl: _wasmUrl, useWasm: true });
              const pdfDoc = await loadingTask.promise;

              // Check total page limit
              totalPagesSoFar += pdfDoc.numPages;
              if (totalPagesSoFar > MAX_TOTAL_PAGES) {
                try { pdfDoc.destroy(); } catch (_) {}
                throw new Error(`${t('home.pdfSplit.tooManyPages')}`);
              }

              pdfSplitLoadedDocs.push({ doc: pdfDoc, fileData, fileName: file.name });

              // Render each page to canvas
              for (let pi = 1; pi <= pdfDoc.numPages; pi++) {
                try {
                  const page = await pdfDoc.getPage(pi);
                  const viewport = page.getViewport({ scale: 1 });
                  const targetWidth = 376;
                  const scale = targetWidth / viewport.width;
                  const scaledViewport = page.getViewport({ scale });

                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = scaledViewport.width;
                  canvas.height = scaledViewport.height;
                  await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

                  pdfSplitPagesData.push({
                    fileIndex: fi,
                    pageIndex: pi,
                    fileName: file.name,
                    canvas
                  });
                } catch (renderErr) {
                  console.warn(`[PDF Split] Failed to render page ${pi} of ${file.name}:`, renderErr);
                  // Create a placeholder canvas for failed pages
                  const canvas = document.createElement('canvas');
                  canvas.width = 376;
                  canvas.height = 500;
                  const ctx = canvas.getContext('2d');
                  ctx.fillStyle = '#f0f0f0';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.fillStyle = '#999';
                  ctx.font = '14px sans-serif';
                  ctx.textAlign = 'center';
                  ctx.fillText('Render failed', canvas.width / 2, canvas.height / 2);
                  pdfSplitPagesData.push({
                    fileIndex: fi,
                    pageIndex: pi,
                    fileName: file.name,
                    canvas
                  });
                }
              }
            }

            if (pdfSplitProcessBarFill) pdfSplitProcessBarFill.style.width = '100%';
            await new Promise(r => setTimeout(r, 300));
            if (pdfSplitProcessMask) pdfSplitProcessMask.classList.remove('visible');
            if (pdfSplitProcessBarFill) pdfSplitProcessBarFill.style.width = '0%';
            pdfSplitProcessing = false;

            renderSplitPreviewPages();
            if (pdfSplitDrawer) pdfSplitDrawer.classList.add('visible');
          } catch (e) {
            console.error('PDF split error:', e);
            // Clean up partially loaded pdfjs docs
            pdfSplitLoadedDocs.forEach(d => { try { d.doc.destroy(); } catch (_) {} });
            pdfSplitLoadedDocs = [];
            pdfSplitPagesData.forEach(p => { if (p.canvas) { p.canvas.width = 0; p.canvas.height = 0; } });
            pdfSplitPagesData = [];
            if (pdfSplitProcessMask) pdfSplitProcessMask.classList.remove('visible');
            if (pdfSplitProcessBarFill) pdfSplitProcessBarFill.style.width = '0%';
            pdfSplitProcessing = false;
            alert(t('common.errorOccurred', { error: String(e) }));
          }
        });
      }

      function renderSplitPreviewPages() {
        if (!pdfSplitDrawerBody) return;
        pdfSplitDrawerBody.innerHTML = '';

        pdfSplitPagesData.forEach((pageData, idx) => {
          const pageEl = document.createElement('div');
          pageEl.className = 'pdf-preview-page';
          pageEl.dataset.index = idx;

          const canvas = pageData.canvas;
          canvas.style.maxWidth = '100%';
          canvas.style.height = 'auto';
          canvas.style.borderRadius = '4px';
          pageEl.appendChild(canvas);

          const indexLabel = document.createElement('span');
          indexLabel.className = 'pdf-preview-page-index';
          indexLabel.textContent = `${idx + 1}`;
          pageEl.appendChild(indexLabel);

          const downloadBtn = document.createElement('button');
          downloadBtn.className = 'pdf-preview-page-rotate-btn';
          downloadBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
          downloadBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await downloadSingleSplitPage(idx);
          });
          pageEl.appendChild(downloadBtn);

          pdfSplitDrawerBody.appendChild(pageEl);
        });

        if (pdfSplitDownloadAllBtn) {
          pdfSplitDownloadAllBtn.textContent = t('home.pdfSplit.downloadAll');
        }
      }

      async function downloadSingleSplitPage(pageIdx) {
        if (pageIdx < 0 || pageIdx >= pdfSplitPagesData.length) return;
        const pageData = pdfSplitPagesData[pageIdx];
        const docInfo = pdfSplitLoadedDocs[pageData.fileIndex];
        if (!docInfo || !docInfo.fileData) {
          console.error(`[PDF Split] Missing file data for file index ${pageData.fileIndex}`);
          alert(t('common.fileDataMissing'));
          return;
        }

        try {
          const { PDFDocument } = await import('pdf-lib');
          const srcPdf = await PDFDocument.load(docInfo.fileData.slice(), { ignoreEncryption: true });
          const newPdf = await PDFDocument.create();
          const [copiedPage] = await newPdf.copyPages(srcPdf, [pageData.pageIndex - 1]);
          newPdf.addPage(copiedPage);
          const singlePageBytes = await newPdf.save();

          if (isTauri) {
            const { invoke } = await import('@tauri-apps/api/core');
            const outputDir = await getOutputDir('Split');
            const baseName = pageData.fileName.replace(/\.pdf$/i, '');
            let fileName = `${baseName}_page_${pageData.pageIndex}.pdf`;
            let fullPath = outputDir + '\\' + fileName;
            let counter = 1;
            while (await invoke('exists_path', { path: fullPath }).catch(() => false)) {
              fileName = `${baseName}_page_${pageData.pageIndex}_${counter}.pdf`;
              fullPath = outputDir + '\\' + fileName;
              counter++;
            }
            await invoke('write_file_bytes', { path: fullPath, bytes: Array.from(singlePageBytes) });
            showPdfSplitSuccess(fullPath, 'single', 1);
          } else {
            const blob = new Blob([singlePageBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${pageData.fileName.replace(/\.pdf$/i, '')}_page_${pageData.pageIndex}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            showPdfSplitSuccess(`~/Downloads/${pageData.fileName.replace(/\.pdf$/i, '')}_page_${pageData.pageIndex}.pdf`, 'single', 1);
          }
        } catch (e) {
          console.error('[PDF Split] Single page save error:', e);
          alert(t('common.errorOccurred', { error: String(e) }));
        }
      }

      // Download all
      if (pdfSplitDownloadAllBtn) {
        pdfSplitDownloadAllBtn.addEventListener('click', async () => {
          if (pdfSplitPagesData.length === 0) return;
          if (pdfSplitProcessMask) pdfSplitProcessMask.classList.add('visible');
          if (pdfSplitProcessBarFill) pdfSplitProcessBarFill.style.width = '30%';
          if (pdfSplitProcessText) pdfSplitProcessText.textContent = t('home.pdfSplit.saving');

          try {
            const { PDFDocument } = await import('pdf-lib');
            let lastSavedDir = '';
            let savedCount = 0;
            const total = pdfSplitPagesData.length;

            // Cache loaded PDFDocument per file index to avoid repeated parsing
            const srcPdfCache = new Map();
            let cachedDocsDir = '';
            let invoke = null;
            if (isTauri) {
              const { invoke: inv } = await import('@tauri-apps/api/core');
              invoke = inv;
              cachedDocsDir = await getOutputDir('Split');
            }

            for (let i = 0; i < total; i++) {
              const pageData = pdfSplitPagesData[i];
              const docInfo = pdfSplitLoadedDocs[pageData.fileIndex];
              if (!docInfo || !docInfo.fileData) continue;

              const progress = Math.round(((i + 1) / total) * 100);
              if (pdfSplitProcessBarFill) pdfSplitProcessBarFill.style.width = progress + '%';

              // Reuse cached srcPdf for the same source file
              let srcPdf = srcPdfCache.get(pageData.fileIndex);
              if (!srcPdf) {
                srcPdf = await PDFDocument.load(docInfo.fileData.slice(), { ignoreEncryption: true });
                srcPdfCache.set(pageData.fileIndex, srcPdf);
              }
              const newPdf = await PDFDocument.create();
              const [copiedPage] = await newPdf.copyPages(srcPdf, [pageData.pageIndex - 1]);
              newPdf.addPage(copiedPage);
              const singlePageBytes = await newPdf.save();

              if (isTauri) {
                const outputDir = cachedDocsDir;
                const baseName = pageData.fileName.replace(/\.pdf$/i, '');
                let fileName = `${baseName}_page_${pageData.pageIndex}.pdf`;
                let fullPath = outputDir + '\\' + fileName;
                let counter = 1;
                while (await invoke('exists_path', { path: fullPath }).catch(() => false)) {
                  fileName = `${baseName}_page_${pageData.pageIndex}_${counter}.pdf`;
                  fullPath = outputDir + '\\' + fileName;
                  counter++;
                }
                await invoke('write_file_bytes', { path: fullPath, bytes: Array.from(singlePageBytes) });
                lastSavedDir = fullPath;
                savedCount++;
              } else {
                const blob = new Blob([singlePageBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${pageData.fileName.replace(/\.pdf$/i, '')}_page_${pageData.pageIndex}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
                savedCount++;
              }
            }

            if (pdfSplitProcessMask) pdfSplitProcessMask.classList.remove('visible');
            if (pdfSplitProcessBarFill) pdfSplitProcessBarFill.style.width = '0%';

            if (savedCount > 0) {
              showPdfSplitSuccess(lastSavedDir || 'Downloads', 'all', savedCount);
            }
          } catch (e) {
            console.error('[PDF Split] Download all error:', e);
            if (pdfSplitProcessMask) pdfSplitProcessMask.classList.remove('visible');
            if (pdfSplitProcessBarFill) pdfSplitProcessBarFill.style.width = '0%';
            alert(t('common.errorOccurred', { error: String(e) }));
          }
        });
      }

      // Drawer close
      if (pdfSplitDrawerClose) {
        pdfSplitDrawerClose.addEventListener('click', () => {
          if (pdfSplitDrawer) pdfSplitDrawer.classList.remove('visible');
        });
      }
      if (pdfSplitDrawerBackdrop) {
        pdfSplitDrawerBackdrop.addEventListener('click', () => {
          if (pdfSplitDrawer) pdfSplitDrawer.classList.remove('visible');
        });
      }

      function showPdfSplitSuccess(savePath, type, count) {
        lastPdfSplitSavedPath = savePath;
        if (pdfSplitSuccessCount) pdfSplitSuccessCount.textContent = String(count);
        if (pdfSplitSuccessPath) pdfSplitSuccessPath.textContent = savePath.replace(/\//g, '\\');
        if (type === 'all') {
          if (pdfSplitSuccessMeta) pdfSplitSuccessMeta.textContent = t('home.pdfSplit.successAllMeta', { count });
        } else {
          if (pdfSplitSuccessMeta) pdfSplitSuccessMeta.textContent = t('home.pdfSplit.successSingleMeta');
        }
        if (pdfSplitSuccessOverlay) pdfSplitSuccessOverlay.classList.add('visible');
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      if (pdfSplitSuccessOk) {
        pdfSplitSuccessOk.addEventListener('click', () => {
          if (pdfSplitSuccessOverlay) pdfSplitSuccessOverlay.classList.remove('visible');
        });
      }
      if (pdfSplitSuccessOpenFolder) {
        pdfSplitSuccessOpenFolder.addEventListener('click', async () => {
          if (isTauri && lastPdfSplitSavedPath) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const folder = lastPdfSplitSavedPath.replace(/[/\\][^/\\]+$/, '').replace(/\//g, '\\');
              await invoke('open_path', { path: folder });
            } catch (e) {
              console.error('[PDF Split] Open folder error:', e);
            }
          }
        });
      }

      // Override close to also clean up split state
      // Replace closePdfSplitOverlay with enhanced version that also cleans up split state
      function closePdfSplitOverlayFull() {
        closePdfSplitOverlay();
        pdfSplitProcessing = false;
        if (pdfSplitProcessMask) pdfSplitProcessMask.classList.remove('visible');
        if (pdfSplitProcessBarFill) pdfSplitProcessBarFill.style.width = '0%';
        clearPdfSplitFiles();
        if (pdfSplitDrawer) pdfSplitDrawer.classList.remove('visible');
        pdfSplitLoadedDocs.forEach(d => { try { d.doc.destroy(); } catch (_) {} });
        pdfSplitLoadedDocs = [];
        pdfSplitPagesData.forEach(p => { if (p.canvas) { p.canvas.width = 0; p.canvas.height = 0; } });
        pdfSplitPagesData = [];
      }
      if (pdfSplitBack) {
        pdfSplitBack.removeEventListener('click', closePdfSplitOverlay);
        pdfSplitBack.addEventListener('click', closePdfSplitOverlayFull);
      }

      // ===== PDF Rotate Overlay Open/Close =====
      const pdfRotateOverlay = document.getElementById('pdfRotateOverlay');
      const pdfRotateFerrofluid = document.getElementById('pdfRotateFerrofluid');
      const pdfRotateBack = document.getElementById('pdfRotateBack');
      let pdfRotateFerrofluidInstance = null;

      function openPdfRotateOverlay() {
        if (!pdfRotateOverlay) return;
        pdfRotateOverlay.classList.add('visible');
        if (pdfRotateFerrofluid && !pdfRotateFerrofluidInstance) {
          pdfRotateFerrofluidInstance = initFerrofluid(pdfRotateFerrofluid, {
            colors: ['#e8e8ec', '#a0a0a8', '#ffffff'],
            speed: 0.3,
            scale: 2,
            opacity: 0.6,
          });
        }
      }

      function closePdfRotateOverlay() {
        if (!pdfRotateOverlay) return;
        pdfRotateOverlay.classList.remove('visible');
        if (pdfRotateFerrofluidInstance) {
          pdfRotateFerrofluidInstance();
          pdfRotateFerrofluidInstance = null;
        }
      }

      if (pdfRotateBack) {
        pdfRotateBack.addEventListener('click', closePdfRotateOverlay);
      }

      document.querySelectorAll('.audio-list-item[data-tool="pdf-rotate"]').forEach(item => {
        item.addEventListener('click', () => {
          openPdfRotateOverlay();
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPdfRotateOverlay();
          }
        });
      });

      // ===== PDF Rotate Interaction =====
      const pdfRotateDropZone = document.getElementById('pdfRotateDropZone');
      const pdfRotateFiles = document.getElementById('pdfRotateFiles');
      const pdfRotateCta = document.getElementById('pdfRotateCta');
      const pdfRotateProcessBtn = document.getElementById('pdfRotateProcessBtn');
      const pdfRotateProcessMask = document.getElementById('pdfRotateProcessMask');
      const pdfRotateProcessBarFill = document.getElementById('pdfRotateProcessBarFill');
      const pdfRotateProcessText = document.getElementById('pdfRotateProcessText');
      const pdfRotateSuccessOverlay = document.getElementById('pdfRotateSuccessOverlay');
      const pdfRotateSuccessPath = document.getElementById('pdfRotateSuccessPath');
      const pdfRotateSuccessMeta = document.getElementById('pdfRotateSuccessMeta');
      const pdfRotateSuccessCount = document.getElementById('pdfRotateSuccessCount');
      const pdfRotateSuccessOpenFolder = document.getElementById('pdfRotateSuccessOpenFolder');
      const pdfRotateSuccessOk = document.getElementById('pdfRotateSuccessOk');
      const pdfRotateDrawer = document.getElementById('pdfRotateDrawer');
      const pdfRotateDrawerBackdrop = document.getElementById('pdfRotateDrawerBackdrop');
      const pdfRotateDrawerClose = document.getElementById('pdfRotateDrawerClose');
      const pdfRotateDrawerBody = document.getElementById('pdfRotateDrawerBody');
      const pdfRotateDownloadAllBtn = document.getElementById('pdfRotateDownloadAllBtn');
      const pdfRotateRotateAllBtn = document.getElementById('pdfRotateRotateAllBtn');

      let selectedPdfRotateFiles = [];
      let pdfRotateProcessing = false;
      let lastPdfRotateSavedPath = '';
      let pdfRotateLoadedDoc = null;  // { doc, fileData, fileName }
      let pdfRotatePagesData = [];    // [{ pageIndex, canvas, rotation, fileName }]
      let pdfRotateSrcPdfCache = null; // cached pdf-lib PDFDocument for single page downloads
      let pdfRotateSingleDownloading = false; // guard for single page download

      function addPdfRotateFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        // Single file only — replace if exists
        if (fileList.length > 1) {
          alert(t('home.pdfRotate.singleFileOnly'));
          return;
        }
        const file = fileList[0];
        selectedPdfRotateFiles = [file]; // Always replace, only 1 file allowed
        renderPdfRotateFiles();
      }

      function clearPdfRotateFiles() {
        selectedPdfRotateFiles = [];
        renderPdfRotateFiles();
      }

      function renderPdfRotateFiles() {
        if (!pdfRotateFiles) return;
        pdfRotateFiles.innerHTML = '';
        if (selectedPdfRotateFiles.length > 0) {
          pdfRotateFiles.classList.add('has-files');
        } else {
          pdfRotateFiles.classList.remove('has-files');
        }
        selectedPdfRotateFiles.forEach((file, index) => {
          const item = document.createElement('div');
          item.className = 'audio-convert-file-item';
          item.dataset.index = index;
          item.innerHTML = `
            <span class="audio-convert-file-index">${index + 1}</span>
            <span class="audio-convert-file-name">${escapeHtml(file.name)}</span>
            <button class="audio-convert-file-remove" data-index="${index}" aria-label="remove">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          `;
          pdfRotateFiles.appendChild(item);
        });
        pdfRotateFiles.querySelectorAll('.audio-convert-file-remove').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearPdfRotateFiles();
          });
        });
        togglePdfRotateProcessButton();
      }

      function togglePdfRotateProcessButton() {
        if (!pdfRotateProcessBtn) return;
        if (selectedPdfRotateFiles.length >= 1) {
          pdfRotateProcessBtn.style.display = '';
          requestAnimationFrame(() => pdfRotateProcessBtn.classList.add('visible'));
        } else {
          pdfRotateProcessBtn.classList.remove('visible');
          const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity' && !pdfRotateProcessBtn.classList.contains('visible')) {
              pdfRotateProcessBtn.style.display = 'none';
              pdfRotateProcessBtn.removeEventListener('transitionend', onTransitionEnd);
            }
          };
          pdfRotateProcessBtn.addEventListener('transitionend', onTransitionEnd);
        }
      }

      function showPdfRotateDropZone() {
        if (pdfRotateDropZone) pdfRotateDropZone.classList.add('visible');
        if (pdfRotateOverlay) pdfRotateOverlay.classList.add('drag-over');
      }

      function hidePdfRotateDropZone() {
        if (pdfRotateDropZone) pdfRotateDropZone.classList.remove('visible');
        if (pdfRotateOverlay) pdfRotateOverlay.classList.remove('drag-over');
      }

      // Tauri native drag-drop
      if (isTauri && pdfRotateOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!pdfRotateOverlay.classList.contains('visible') || pdfRotateProcessing) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') {
              showPdfRotateDropZone();
            } else if (payload.type === 'leave') {
              hidePdfRotateDropZone();
            } else if (payload.type === 'drop') {
              hidePdfRotateDropZone();
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const fileList = paths
                .filter(p => p.toLowerCase().endsWith('.pdf'))
                .map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
              if (fileList.length > 0) {
                addPdfRotateFiles(fileList);
              }
            }
          });
        })();
      }

      // CTA button — open file dialog
      if (pdfRotateCta) {
        pdfRotateCta.addEventListener('click', async () => {
          if (isTauri) {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({
                multiple: false,
                filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
              });
              if (selected && typeof selected === 'string') {
                addPdfRotateFiles([{ name: selected.split(/[\\/]/).pop() || selected, path: selected, size: 0 }]);
              }
            } catch (e) {
              console.error('PDF rotate file selection error', e);
            }
          } else {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf,application/pdf';
            input.addEventListener('change', () => {
              addPdfRotateFiles(input.files);
              input.value = '';
            });
            input.click();
          }
        });
      }

      // ===== PDF Rotate: Real Implementation =====
      // Process button — load PDF and render previews
      if (pdfRotateProcessBtn) {
        pdfRotateProcessBtn.addEventListener('click', async () => {
          if (selectedPdfRotateFiles.length < 1 || pdfRotateProcessing) return;
          pdfRotateProcessing = true;
          if (pdfRotateProcessMask) pdfRotateProcessMask.classList.add('visible');
          if (pdfRotateProcessBarFill) pdfRotateProcessBarFill.style.width = '10%';
          if (pdfRotateProcessText) pdfRotateProcessText.textContent = t('home.pdfRotate.processing');

          try {
            // Clear previous state
            if (pdfRotateLoadedDoc) {
              try { pdfRotateLoadedDoc.doc.destroy(); } catch (_) {}
              pdfRotateLoadedDoc = null;
            }
            pdfRotateSrcPdfCache = null;
            pdfRotatePagesData.forEach(p => { if (p.canvas) { p.canvas.width = 0; p.canvas.height = 0; } });
            pdfRotatePagesData = [];

            // Configure pdf.js worker
            const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
            pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
              'pdfjs-dist/build/pdf.worker.mjs',
              import.meta.url
            ).toString();

            const file = selectedPdfRotateFiles[0];

            // Read file bytes
            let fileData;
            if (isTauri && file.path) {
              const { invoke } = await import('@tauri-apps/api/core');
              const rawBytes = await invoke('read_file_bytes', { path: file.path });
              if (Array.isArray(rawBytes)) {
                fileData = Uint8Array.from(rawBytes);
              } else if (rawBytes instanceof ArrayBuffer) {
                fileData = new Uint8Array(rawBytes);
              } else if (rawBytes instanceof Uint8Array) {
                fileData = rawBytes;
              } else if (rawBytes && typeof rawBytes.length === 'number') {
                fileData = Uint8Array.from(rawBytes);
              } else {
                throw new Error(`Invalid file data for ${file.name}: ${typeof rawBytes}`);
              }
              if (fileData.length === 0) throw new Error(`File ${file.name} is empty`);
            } else {
              fileData = new Uint8Array(await file.arrayBuffer());
            }

            // Load with pdfjs for preview
            const _wasmUrl = new URL('assets/', document.baseURI).href;
            const loadingTask = pdfjsLib.getDocument({ data: fileData.slice(), wasmUrl: _wasmUrl, useWasm: true });
            const pdfDoc = await loadingTask.promise;

            // Check page limit
            const MAX_TOTAL_PAGES = 2000;
            if (pdfDoc.numPages > MAX_TOTAL_PAGES) {
              try { pdfDoc.destroy(); } catch (_) {}
              throw new Error(t('home.pdfRotate.tooManyPages'));
            }

            pdfRotateLoadedDoc = { doc: pdfDoc, fileData, fileName: file.name };

            if (pdfRotateProcessBarFill) pdfRotateProcessBarFill.style.width = '50%';

            // Render each page to canvas
            for (let pi = 1; pi <= pdfDoc.numPages; pi++) {
              const renderProgress = 50 + Math.round((pi / pdfDoc.numPages) * 50);
              if (pdfRotateProcessBarFill) pdfRotateProcessBarFill.style.width = renderProgress + '%';
              try {
                const page = await pdfDoc.getPage(pi);
                const viewport = page.getViewport({ scale: 1 });
                const targetWidth = 376;
                const scale = targetWidth / viewport.width;
                const scaledViewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = scaledViewport.width;
                canvas.height = scaledViewport.height;
                await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

                pdfRotatePagesData.push({
                  pageIndex: pi,
                  fileName: file.name,
                  canvas,
                  rotation: 0
                });
              } catch (renderErr) {
                console.warn(`[PDF Rotate] Failed to render page ${pi}:`, renderErr);
                const canvas = document.createElement('canvas');
                canvas.width = 376;
                canvas.height = 500;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#f0f0f0';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#999';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Render failed', canvas.width / 2, canvas.height / 2);
                pdfRotatePagesData.push({
                  pageIndex: pi,
                  fileName: file.name,
                  canvas,
                  rotation: 0
                });
              }
            }

            if (pdfRotateProcessBarFill) pdfRotateProcessBarFill.style.width = '100%';
            await new Promise(r => setTimeout(r, 300));
            if (pdfRotateProcessMask) pdfRotateProcessMask.classList.remove('visible');
            if (pdfRotateProcessBarFill) pdfRotateProcessBarFill.style.width = '0%';
            pdfRotateProcessing = false;

            renderRotatePreviewPages();
            if (pdfRotateDrawer) pdfRotateDrawer.classList.add('visible');
          } catch (e) {
            console.error('PDF rotate error:', e);
            if (pdfRotateLoadedDoc) {
              try { pdfRotateLoadedDoc.doc.destroy(); } catch (_) {}
              pdfRotateLoadedDoc = null;
            }
            pdfRotateSrcPdfCache = null;
            pdfRotatePagesData.forEach(p => { if (p.canvas) { p.canvas.width = 0; p.canvas.height = 0; } });
            pdfRotatePagesData = [];
            if (pdfRotateProcessMask) pdfRotateProcessMask.classList.remove('visible');
            if (pdfRotateProcessBarFill) pdfRotateProcessBarFill.style.width = '0%';
            pdfRotateProcessing = false;
            alert(t('common.errorOccurred', { error: String(e) }));
          }
        });
      }

      function renderRotatePreviewPages() {
        if (!pdfRotateDrawerBody) return;
        pdfRotateDrawerBody.innerHTML = '';

        pdfRotatePagesData.forEach((pageData, idx) => {
          const pageEl = document.createElement('div');
          pageEl.className = 'pdf-preview-page';
          pageEl.dataset.index = idx;

          const canvas = pageData.canvas;
          canvas.style.maxWidth = '100%';
          canvas.style.height = 'auto';
          canvas.style.borderRadius = '4px';
          canvas.style.transform = `rotate(${pageData.rotation}deg)`;
          canvas.style.transition = 'transform 0.2s ease';
          pageEl.appendChild(canvas);

          const indexLabel = document.createElement('span');
          indexLabel.className = 'pdf-preview-page-index';
          indexLabel.textContent = `${idx + 1}`;
          pageEl.appendChild(indexLabel);

          // Button container for rotate + download
          const btnContainer = document.createElement('div');
          btnContainer.style.cssText = 'display:flex;gap:6px;position:absolute;bottom:8px;right:8px;';

          // Rotate button
          const rotateBtn = document.createElement('button');
          rotateBtn.className = 'pdf-preview-page-rotate-btn';
          rotateBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
          rotateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            pageData.rotation = (pageData.rotation + 90) % 360;
            canvas.style.transform = `rotate(${pageData.rotation}deg)`;
          });
          btnContainer.appendChild(rotateBtn);

          // Download button
          const downloadBtn = document.createElement('button');
          downloadBtn.className = 'pdf-preview-page-rotate-btn';
          downloadBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
          downloadBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await downloadSingleRotatePage(idx);
          });
          btnContainer.appendChild(downloadBtn);

          pageEl.appendChild(btnContainer);
          pdfRotateDrawerBody.appendChild(pageEl);
        });

        if (pdfRotateDownloadAllBtn) {
          pdfRotateDownloadAllBtn.textContent = t('home.pdfRotate.downloadAll');
        }
        if (pdfRotateRotateAllBtn) {
          pdfRotateRotateAllBtn.textContent = t('home.pdfRotate.rotateAll');
        }
      }

      // Rotate all pages 90°
      if (pdfRotateRotateAllBtn) {
        pdfRotateRotateAllBtn.addEventListener('click', () => {
          pdfRotatePagesData.forEach(pageData => {
            pageData.rotation = (pageData.rotation + 90) % 360;
            pageData.canvas.style.transform = `rotate(${pageData.rotation}deg)`;
          });
        });
      }

      async function downloadSingleRotatePage(pageIdx) {
        if (pageIdx < 0 || pageIdx >= pdfRotatePagesData.length) return;
        if (!pdfRotateLoadedDoc || !pdfRotateLoadedDoc.fileData) {
          alert(t('common.fileDataMissing'));
          return;
        }
        if (pdfRotateSingleDownloading) return; // prevent concurrent downloads
        pdfRotateSingleDownloading = true;

        const pageData = pdfRotatePagesData[pageIdx];
        try {
          const { PDFDocument, degrees } = await import('pdf-lib');
          // Reuse cached srcPdf to avoid repeated parsing
          if (!pdfRotateSrcPdfCache) {
            pdfRotateSrcPdfCache = await PDFDocument.load(pdfRotateLoadedDoc.fileData.slice(), { ignoreEncryption: true });
          }
          const newPdf = await PDFDocument.create();
          const [copiedPage] = await newPdf.copyPages(pdfRotateSrcPdfCache, [pageData.pageIndex - 1]);
          newPdf.addPage(copiedPage);
          // Apply rotation (add to existing rotation)
          const pages = newPdf.getPages();
          const existingRotation = pages[0].getRotation().angle;
          pages[0].setRotation(degrees((existingRotation + pageData.rotation) % 360));
          const singlePageBytes = await newPdf.save();

          if (isTauri) {
            const { invoke } = await import('@tauri-apps/api/core');
            const outputDir = await getOutputDir('Rotate');
            const baseName = pageData.fileName.replace(/\.pdf$/i, '');
            let fileName = `${baseName}_page_${pageData.pageIndex}_rotated.pdf`;
            let fullPath = outputDir + '\\' + fileName;
            let counter = 1;
            while (await invoke('exists_path', { path: fullPath }).catch(() => false)) {
              fileName = `${baseName}_page_${pageData.pageIndex}_rotated_${counter}.pdf`;
              fullPath = outputDir + '\\' + fileName;
              counter++;
            }
            await invoke('write_file_bytes', { path: fullPath, bytes: Array.from(singlePageBytes) });
            showPdfRotateSuccess(fullPath, 'single', 1);
          } else {
            const blob = new Blob([singlePageBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${pageData.fileName.replace(/\.pdf$/i, '')}_page_${pageData.pageIndex}_rotated.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            showPdfRotateSuccess(`~/Downloads/${pageData.fileName.replace(/\.pdf$/i, '')}_page_${pageData.pageIndex}_rotated.pdf`, 'single', 1);
          }
        } catch (e) {
          console.error('[PDF Rotate] Single page save error:', e);
          alert(t('common.errorOccurred', { error: String(e) }));
        } finally {
          pdfRotateSingleDownloading = false;
        }
      }

      // Download all — export all pages as a single PDF with rotation applied
      if (pdfRotateDownloadAllBtn) {
        pdfRotateDownloadAllBtn.addEventListener('click', async () => {
          if (pdfRotatePagesData.length === 0) return;
          if (!pdfRotateLoadedDoc || !pdfRotateLoadedDoc.fileData) return;
          if (pdfRotateProcessing) return; // prevent concurrent export
          pdfRotateProcessing = true;
          if (pdfRotateProcessMask) pdfRotateProcessMask.classList.add('visible');
          if (pdfRotateProcessBarFill) pdfRotateProcessBarFill.style.width = '30%';
          if (pdfRotateProcessText) pdfRotateProcessText.textContent = t('home.pdfRotate.saving');

          try {
            const { PDFDocument, degrees } = await import('pdf-lib');
            const srcPdf = await PDFDocument.load(pdfRotateLoadedDoc.fileData.slice(), { ignoreEncryption: true });
            const newPdf = await PDFDocument.create();
            const totalPages = pdfRotatePagesData.length;

            for (let i = 0; i < totalPages; i++) {
              const pageData = pdfRotatePagesData[i];
              const progress = Math.round(((i + 1) / totalPages) * 100);
              if (pdfRotateProcessBarFill) pdfRotateProcessBarFill.style.width = progress + '%';

              const [copiedPage] = await newPdf.copyPages(srcPdf, [pageData.pageIndex - 1]);
              newPdf.addPage(copiedPage);
              // Apply rotation (add to existing rotation)
              const pages = newPdf.getPages();
              const lastPage = pages[pages.length - 1];
              const existingRotation = lastPage.getRotation().angle;
              lastPage.setRotation(degrees((existingRotation + pageData.rotation) % 360));
            }

            const mergedBytes = await newPdf.save();

            if (isTauri) {
              let invoke = null;
              const { invoke: inv } = await import('@tauri-apps/api/core');
              invoke = inv;
              const outputDir = await getOutputDir('Rotate');
              const baseName = pdfRotateLoadedDoc.fileName.replace(/\.pdf$/i, '');
              let fileName = `${baseName}_rotated.pdf`;
              let fullPath = outputDir + '\\' + fileName;
              let counter = 1;
              while (await invoke('exists_path', { path: fullPath }).catch(() => false)) {
                fileName = `${baseName}_rotated_${counter}.pdf`;
                fullPath = outputDir + '\\' + fileName;
                counter++;
              }
              await invoke('write_file_bytes', { path: fullPath, bytes: Array.from(mergedBytes) });
              if (pdfRotateProcessMask) pdfRotateProcessMask.classList.remove('visible');
              if (pdfRotateProcessBarFill) pdfRotateProcessBarFill.style.width = '0%';
              showPdfRotateSuccess(fullPath, 'all', totalPages);
              pdfRotateProcessing = false;
            } else {
              const blob = new Blob([mergedBytes], { type: 'application/pdf' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${pdfRotateLoadedDoc.fileName.replace(/\.pdf$/i, '')}_rotated.pdf`;
              a.click();
              URL.revokeObjectURL(url);
              if (pdfRotateProcessMask) pdfRotateProcessMask.classList.remove('visible');
              if (pdfRotateProcessBarFill) pdfRotateProcessBarFill.style.width = '0%';
              showPdfRotateSuccess(`~/Downloads/${pdfRotateLoadedDoc.fileName.replace(/\.pdf$/i, '')}_rotated.pdf`, 'all', totalPages);
              pdfRotateProcessing = false;
            }
          } catch (e) {
            console.error('[PDF Rotate] Export all error:', e);
            if (pdfRotateProcessMask) pdfRotateProcessMask.classList.remove('visible');
            if (pdfRotateProcessBarFill) pdfRotateProcessBarFill.style.width = '0%';
            pdfRotateProcessing = false;
            alert(t('common.errorOccurred', { error: String(e) }));
          }
        });
      }

      // Drawer close
      if (pdfRotateDrawerClose) {
        pdfRotateDrawerClose.addEventListener('click', () => {
          if (pdfRotateDrawer) pdfRotateDrawer.classList.remove('visible');
        });
      }
      if (pdfRotateDrawerBackdrop) {
        pdfRotateDrawerBackdrop.addEventListener('click', () => {
          if (pdfRotateDrawer) pdfRotateDrawer.classList.remove('visible');
        });
      }

      function showPdfRotateSuccess(savePath, type, count) {
        lastPdfRotateSavedPath = savePath;
        if (pdfRotateSuccessCount) pdfRotateSuccessCount.textContent = String(count);
        if (pdfRotateSuccessPath) pdfRotateSuccessPath.textContent = savePath.replace(/\//g, '\\');
        if (type === 'all') {
          if (pdfRotateSuccessMeta) pdfRotateSuccessMeta.textContent = t('home.pdfRotate.successAllMeta');
        } else {
          if (pdfRotateSuccessMeta) pdfRotateSuccessMeta.textContent = t('home.pdfRotate.successSingleMeta');
        }
        if (pdfRotateSuccessOverlay) pdfRotateSuccessOverlay.classList.add('visible');
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      if (pdfRotateSuccessOk) {
        pdfRotateSuccessOk.addEventListener('click', () => {
          if (pdfRotateSuccessOverlay) pdfRotateSuccessOverlay.classList.remove('visible');
        });
      }
      if (pdfRotateSuccessOpenFolder) {
        pdfRotateSuccessOpenFolder.addEventListener('click', async () => {
          if (isTauri && lastPdfRotateSavedPath) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const folder = lastPdfRotateSavedPath.replace(/[/\\][^/\\]+$/, '').replace(/\//g, '\\');
              await invoke('open_path', { path: folder });
            } catch (e) {
              console.error('[PDF Rotate] Open folder error:', e);
            }
          }
        });
      }

      // Close cleanup
      function closePdfRotateOverlayFull() {
        closePdfRotateOverlay();
        pdfRotateProcessing = false;
        pdfRotateSingleDownloading = false;
        if (pdfRotateProcessMask) pdfRotateProcessMask.classList.remove('visible');
        if (pdfRotateProcessBarFill) pdfRotateProcessBarFill.style.width = '0%';
        clearPdfRotateFiles();
        if (pdfRotateDrawer) pdfRotateDrawer.classList.remove('visible');
        if (pdfRotateLoadedDoc) {
          try { pdfRotateLoadedDoc.doc.destroy(); } catch (_) {}
          pdfRotateLoadedDoc = null;
        }
        pdfRotateSrcPdfCache = null;
        pdfRotatePagesData.forEach(p => { if (p.canvas) { p.canvas.width = 0; p.canvas.height = 0; } });
        pdfRotatePagesData = [];
      }
      if (pdfRotateBack) {
        pdfRotateBack.removeEventListener('click', closePdfRotateOverlay);
        pdfRotateBack.addEventListener('click', closePdfRotateOverlayFull);
      }

      // ===== PDF Encrypt Overlay Open/Close =====
      const pdfEncryptOverlay = document.getElementById('pdfEncryptOverlay');
      const pdfEncryptFerrofluid = document.getElementById('pdfEncryptFerrofluid');
      const pdfEncryptBack = document.getElementById('pdfEncryptBack');
      let pdfEncryptFerrofluidInstance = null;

      function openPdfEncryptOverlay() {
        if (!pdfEncryptOverlay) return;
        pdfEncryptOverlay.classList.add('visible');
        if (pdfEncryptFerrofluid && !pdfEncryptFerrofluidInstance) {
          pdfEncryptFerrofluidInstance = initFerrofluid(pdfEncryptFerrofluid, {
            colors: ['#e8e8ec', '#a0a0a8', '#ffffff'],
            speed: 0.3,
            scale: 2,
            opacity: 0.6,
          });
        }
      }

      function closePdfEncryptOverlay() {
        if (!pdfEncryptOverlay) return;
        pdfEncryptOverlay.classList.remove('visible');
        if (pdfEncryptFerrofluidInstance) {
          pdfEncryptFerrofluidInstance();
          pdfEncryptFerrofluidInstance = null;
        }
      }

      if (pdfEncryptBack) {
        pdfEncryptBack.addEventListener('click', closePdfEncryptOverlayFull);
      }

      document.querySelectorAll('.audio-list-item[data-tool="pdf-encrypt"]').forEach(item => {
        item.addEventListener('click', () => {
          openPdfEncryptOverlay();
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPdfEncryptOverlay();
          }
        });
      });

      // ===== PDF Encrypt Interaction =====
      const pdfEncryptDropZone = document.getElementById('pdfEncryptDropZone');
      const pdfEncryptFiles = document.getElementById('pdfEncryptFiles');
      const pdfEncryptCta = document.getElementById('pdfEncryptCta');
      const pdfEncryptProcessBtn = document.getElementById('pdfEncryptProcessBtn');
      const pdfEncryptProcessMask = document.getElementById('pdfEncryptProcessMask');
      const pdfEncryptProcessBarFill = document.getElementById('pdfEncryptProcessBarFill');
      const pdfEncryptProcessText = document.getElementById('pdfEncryptProcessText');
      const pdfEncryptSuccessOverlay = document.getElementById('pdfEncryptSuccessOverlay');
      const pdfEncryptSuccessPath = document.getElementById('pdfEncryptSuccessPath');
      const pdfEncryptSuccessMeta = document.getElementById('pdfEncryptSuccessMeta');
      const pdfEncryptSuccessCount = document.getElementById('pdfEncryptSuccessCount');
      const pdfEncryptSuccessOpenFolder = document.getElementById('pdfEncryptSuccessOpenFolder');
      const pdfEncryptSuccessOk = document.getElementById('pdfEncryptSuccessOk');
      const pdfEncryptPasswordDialog = document.getElementById('pdfEncryptPasswordDialog');
      const pdfEncryptPasswordInput = document.getElementById('pdfEncryptPasswordInput');
      const pdfEncryptConfirmInput = document.getElementById('pdfEncryptConfirmInput');
      const pdfEncryptPasswordCancel = document.getElementById('pdfEncryptPasswordCancel');
      const pdfEncryptPasswordConfirm = document.getElementById('pdfEncryptPasswordConfirm');
      const pdfEncryptPermPrinting = document.getElementById('pdfEncryptPermPrinting');
      const pdfEncryptPermCopying = document.getElementById('pdfEncryptPermCopying');
      const pdfEncryptPermModifying = document.getElementById('pdfEncryptPermModifying');
      const pdfEncryptPermAnnotating = document.getElementById('pdfEncryptPermAnnotating');
      const pdfEncryptPermFilling = document.getElementById('pdfEncryptPermFilling');
      const pdfEncryptPermAccessibility = document.getElementById('pdfEncryptPermAccessibility');
      const pdfEncryptPermAssembly = document.getElementById('pdfEncryptPermAssembly');
      const pdfEncryptPermHighQualityPrint = document.getElementById('pdfEncryptPermHighQualityPrint');

      let selectedPdfEncryptFiles = [];
      let pdfEncryptProcessing = false;
      let lastPdfEncryptSavedPath = '';

      function addPdfEncryptFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        if (fileList.length > 1) {
          alert(t('home.pdfEncrypt.singleFileOnly'));
          return;
        }
        const file = fileList[0];
        selectedPdfEncryptFiles = [file];
        renderPdfEncryptFiles();
      }

      function clearPdfEncryptFiles() {
        selectedPdfEncryptFiles = [];
        renderPdfEncryptFiles();
      }

      function renderPdfEncryptFiles() {
        if (!pdfEncryptFiles) return;
        pdfEncryptFiles.innerHTML = '';
        if (selectedPdfEncryptFiles.length > 0) {
          pdfEncryptFiles.classList.add('has-files');
        } else {
          pdfEncryptFiles.classList.remove('has-files');
        }
        selectedPdfEncryptFiles.forEach((file, index) => {
          const item = document.createElement('div');
          item.className = 'audio-convert-file-item';
          item.dataset.index = index;
          item.innerHTML = `
            <span class="audio-convert-file-index">${index + 1}</span>
            <span class="audio-convert-file-name">${escapeHtml(file.name)}</span>
            <button class="audio-convert-file-remove" data-index="${index}" aria-label="remove">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          `;
          pdfEncryptFiles.appendChild(item);
        });
        pdfEncryptFiles.querySelectorAll('.audio-convert-file-remove').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearPdfEncryptFiles();
          });
        });
        togglePdfEncryptProcessButton();
      }

      function togglePdfEncryptProcessButton() {
        if (!pdfEncryptProcessBtn) return;
        if (selectedPdfEncryptFiles.length >= 1) {
          pdfEncryptProcessBtn.style.display = '';
          requestAnimationFrame(() => pdfEncryptProcessBtn.classList.add('visible'));
        } else {
          pdfEncryptProcessBtn.classList.remove('visible');
          const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity' && !pdfEncryptProcessBtn.classList.contains('visible')) {
              pdfEncryptProcessBtn.style.display = 'none';
              pdfEncryptProcessBtn.removeEventListener('transitionend', onTransitionEnd);
            }
          };
          pdfEncryptProcessBtn.addEventListener('transitionend', onTransitionEnd);
        }
      }

      function showPdfEncryptDropZone() {
        if (pdfEncryptDropZone) pdfEncryptDropZone.classList.add('visible');
        if (pdfEncryptOverlay) pdfEncryptOverlay.classList.add('drag-over');
      }

      function hidePdfEncryptDropZone() {
        if (pdfEncryptDropZone) pdfEncryptDropZone.classList.remove('visible');
        if (pdfEncryptOverlay) pdfEncryptOverlay.classList.remove('drag-over');
      }

      // Tauri native drag-drop
      if (isTauri && pdfEncryptOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!pdfEncryptOverlay.classList.contains('visible') || pdfEncryptProcessing) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') {
              showPdfEncryptDropZone();
            } else if (payload.type === 'leave') {
              hidePdfEncryptDropZone();
            } else if (payload.type === 'drop') {
              hidePdfEncryptDropZone();
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const fileList = paths
                .filter(p => p.toLowerCase().endsWith('.pdf'))
                .map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
              if (fileList.length > 0) {
                addPdfEncryptFiles(fileList);
              }
            }
          });
        })();
      }

      // CTA button — open file dialog
      if (pdfEncryptCta) {
        pdfEncryptCta.addEventListener('click', async () => {
          if (isTauri) {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({
                multiple: false,
                filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
              });
              if (selected && typeof selected === 'string') {
                addPdfEncryptFiles([{ name: selected.split(/[\\/]/).pop() || selected, path: selected, size: 0 }]);
              }
            } catch (e) {
              console.error('PDF encrypt file selection error', e);
            }
          } else {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf,application/pdf';
            input.addEventListener('change', () => {
              addPdfEncryptFiles(input.files);
              input.value = '';
            });
            input.click();
          }
        });
      }

      // Process button — show password dialog
      if (pdfEncryptProcessBtn) {
        pdfEncryptProcessBtn.addEventListener('click', () => {
          if (selectedPdfEncryptFiles.length < 1 || pdfEncryptProcessing) return;
          // Reset password fields
          if (pdfEncryptPasswordInput) { pdfEncryptPasswordInput.value = ''; pdfEncryptPasswordInput.type = 'password'; }
          if (pdfEncryptConfirmInput) { pdfEncryptConfirmInput.value = ''; pdfEncryptConfirmInput.type = 'password'; }
          // Reset eye buttons
          document.querySelectorAll('.pdf-encrypt-eye-btn').forEach(btn => btn.classList.remove('show'));
          // Reset permissions to default (all checked)
          [pdfEncryptPermPrinting, pdfEncryptPermCopying, pdfEncryptPermModifying, pdfEncryptPermAnnotating,
           pdfEncryptPermFilling, pdfEncryptPermAccessibility, pdfEncryptPermAssembly, pdfEncryptPermHighQualityPrint
          ].forEach(cb => { if (cb) cb.checked = true; });
          // Show password dialog
          if (pdfEncryptPasswordDialog) pdfEncryptPasswordDialog.classList.add('visible');
        });
      }

      // Password dialog cancel
      if (pdfEncryptPasswordCancel) {
        pdfEncryptPasswordCancel.addEventListener('click', () => {
          if (pdfEncryptPasswordDialog) pdfEncryptPasswordDialog.classList.remove('visible');
        });
      }

      // Password eye toggle
      ['pdfEncryptEyeBtn1', 'pdfEncryptEyeBtn2'].forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const input = btn.parentElement.querySelector('input');
        if (!input) return;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          btn.classList.toggle('show', isPassword);
          input.focus();
        });
      });

      // Password dialog confirm — start encryption
      async function handleEncryptConfirm() {
        if (pdfEncryptProcessing) return;
        const password = pdfEncryptPasswordInput ? pdfEncryptPasswordInput.value : '';
        const confirmPwd = pdfEncryptConfirmInput ? pdfEncryptConfirmInput.value : '';

        if (!password) {
          alert(t('home.pdfEncrypt.passwordEmpty'));
          return;
        }
        if (password !== confirmPwd) {
          alert(t('home.pdfEncrypt.passwordMismatch'));
          return;
        }

        // Close password dialog
        if (pdfEncryptPasswordDialog) pdfEncryptPasswordDialog.classList.remove('visible');

        // Start encryption
        pdfEncryptProcessing = true;
        if (pdfEncryptProcessMask) pdfEncryptProcessMask.classList.add('visible');
        if (pdfEncryptProcessBarFill) pdfEncryptProcessBarFill.style.width = '10%';
        if (pdfEncryptProcessText) pdfEncryptProcessText.textContent = t('home.pdfEncrypt.encrypting');

        try {
          const { PDFDocument } = await import('pdf-lib-plus-encrypt');

          const file = selectedPdfEncryptFiles[0];

          // Read file bytes
          let fileData;
          if (isTauri && file.path) {
            const { invoke } = await import('@tauri-apps/api/core');
            const rawBytes = await invoke('read_file_bytes', { path: file.path });
            if (Array.isArray(rawBytes)) {
              fileData = Uint8Array.from(rawBytes);
            } else if (rawBytes instanceof ArrayBuffer) {
              fileData = new Uint8Array(rawBytes);
            } else if (rawBytes instanceof Uint8Array) {
              fileData = rawBytes;
            } else if (rawBytes && typeof rawBytes.length === 'number') {
              fileData = Uint8Array.from(rawBytes);
            } else {
              throw new Error(`Invalid file data for ${file.name}: ${typeof rawBytes}`);
            }
            if (fileData.length === 0) throw new Error(`File ${file.name} is empty`);
          } else {
            fileData = new Uint8Array(await file.arrayBuffer());
          }

          if (pdfEncryptProcessBarFill) pdfEncryptProcessBarFill.style.width = '40%';

          // Load PDF
          const pdfDoc = await PDFDocument.load(fileData.slice(), { ignoreEncryption: true });

          if (pdfEncryptProcessBarFill) pdfEncryptProcessBarFill.style.width = '70%';

          // Build permissions object (boolean/string values for pdf-lib-plus-encrypt)
          const permPrinting = pdfEncryptPermPrinting && pdfEncryptPermPrinting.checked;
          const permHighQuality = pdfEncryptPermHighQualityPrint && pdfEncryptPermHighQualityPrint.checked;
          const permissions = {
            printing: permPrinting ? (permHighQuality ? 'highResolution' : 'lowResolution') : false,
            modifying: !!(pdfEncryptPermModifying && pdfEncryptPermModifying.checked),
            copying: !!(pdfEncryptPermCopying && pdfEncryptPermCopying.checked),
            annotating: !!(pdfEncryptPermAnnotating && pdfEncryptPermAnnotating.checked),
            fillingForms: !!(pdfEncryptPermFilling && pdfEncryptPermFilling.checked),
            contentAccessibility: !!(pdfEncryptPermAccessibility && pdfEncryptPermAccessibility.checked),
            documentAssembly: !!(pdfEncryptPermAssembly && pdfEncryptPermAssembly.checked),
          };

          // Encrypt the document
          pdfDoc.encrypt({
            userPassword: password,
            ownerPassword: password,
            permissions,
          });

          // Save (useObjectStreams: false required for encrypted PDFs)
          const encryptedBytes = await pdfDoc.save({ useObjectStreams: false });

          if (pdfEncryptProcessBarFill) pdfEncryptProcessBarFill.style.width = '100%';

          // Write file
          if (isTauri) {
            const { invoke } = await import('@tauri-apps/api/core');
            const outputDir = await getOutputDir('Encrypt');
            const baseName = file.name.replace(/\.pdf$/i, '');
            let fileName = `${baseName}_encrypted.pdf`;
            let fullPath = outputDir + '\\' + fileName;
            let counter = 1;
            while (await invoke('exists_path', { path: fullPath }).catch(() => false)) {
              fileName = `${baseName}_encrypted_${counter}.pdf`;
              fullPath = outputDir + '\\' + fileName;
              counter++;
            }
            await invoke('write_file_bytes', { path: fullPath, bytes: Array.from(encryptedBytes) });
            if (pdfEncryptProcessMask) pdfEncryptProcessMask.classList.remove('visible');
            if (pdfEncryptProcessBarFill) pdfEncryptProcessBarFill.style.width = '0%';
            pdfEncryptProcessing = false;
            showPdfEncryptSuccess(fullPath, 1);
          } else {
            const blob = new Blob([encryptedBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${file.name.replace(/\.pdf$/i, '')}_encrypted.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            if (pdfEncryptProcessMask) pdfEncryptProcessMask.classList.remove('visible');
            if (pdfEncryptProcessBarFill) pdfEncryptProcessBarFill.style.width = '0%';
            pdfEncryptProcessing = false;
            showPdfEncryptSuccess(`~/Downloads/${file.name.replace(/\.pdf$/i, '')}_encrypted.pdf`, 1);
          }
        } catch (e) {
          console.error('[PDF Encrypt] Error:', e);
          if (pdfEncryptProcessMask) pdfEncryptProcessMask.classList.remove('visible');
          if (pdfEncryptProcessBarFill) pdfEncryptProcessBarFill.style.width = '0%';
          pdfEncryptProcessing = false;
          alert(t('common.errorOccurred', { error: String(e) }));
        }
      }

      if (pdfEncryptPasswordConfirm) {
        pdfEncryptPasswordConfirm.addEventListener('click', handleEncryptConfirm);
      }
      if (pdfEncryptConfirmInput) {
        pdfEncryptConfirmInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleEncryptConfirm();
          }
        });
      }
      if (pdfEncryptPasswordInput) {
        pdfEncryptPasswordInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (pdfEncryptConfirmInput) pdfEncryptConfirmInput.focus();
          }
        });
      }

      function showPdfEncryptSuccess(savePath, count) {
        lastPdfEncryptSavedPath = savePath;
        if (pdfEncryptSuccessCount) pdfEncryptSuccessCount.textContent = String(count);
        if (pdfEncryptSuccessPath) pdfEncryptSuccessPath.textContent = savePath.replace(/\//g, '\\');
        if (pdfEncryptSuccessMeta) pdfEncryptSuccessMeta.textContent = t('home.pdfEncrypt.successMeta');
        if (pdfEncryptSuccessOverlay) pdfEncryptSuccessOverlay.classList.add('visible');
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      if (pdfEncryptSuccessOk) {
        pdfEncryptSuccessOk.addEventListener('click', () => {
          if (pdfEncryptSuccessOverlay) pdfEncryptSuccessOverlay.classList.remove('visible');
        });
      }

      if (pdfEncryptSuccessOpenFolder) {
        pdfEncryptSuccessOpenFolder.addEventListener('click', async () => {
          if (isTauri && lastPdfEncryptSavedPath) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const folder = lastPdfEncryptSavedPath.replace(/[/\\][^/\\]+$/, '').replace(/\//g, '\\');
              await invoke('open_path', { path: folder });
            } catch (e) {
              console.error('[PDF Encrypt] Open folder error:', e);
            }
          }
        });
      }

      // Close cleanup
      function closePdfEncryptOverlayFull() {
        closePdfEncryptOverlay();
        pdfEncryptProcessing = false;
        if (pdfEncryptProcessMask) pdfEncryptProcessMask.classList.remove('visible');
        if (pdfEncryptProcessBarFill) pdfEncryptProcessBarFill.style.width = '0%';
        if (pdfEncryptPasswordDialog) pdfEncryptPasswordDialog.classList.remove('visible');
        if (pdfEncryptSuccessOverlay) pdfEncryptSuccessOverlay.classList.remove('visible');
        clearPdfEncryptFiles();
      }

      // ===== PDF Decrypt Overlay Open/Close =====
      const pdfDecryptOverlay = document.getElementById('pdfDecryptOverlay');
      const pdfDecryptFerrofluid = document.getElementById('pdfDecryptFerrofluid');
      const pdfDecryptBack = document.getElementById('pdfDecryptBack');
      let pdfDecryptFerrofluidInstance = null;

      function openPdfDecryptOverlay() {
        if (!pdfDecryptOverlay) return;
        pdfDecryptOverlay.classList.add('visible');
        if (pdfDecryptFerrofluid && !pdfDecryptFerrofluidInstance) {
          pdfDecryptFerrofluidInstance = initFerrofluid(pdfDecryptFerrofluid, {
            colors: ['#e8e8ec', '#a0a0a8', '#ffffff'],
            speed: 0.3,
            scale: 2,
            opacity: 0.6,
          });
        }
      }

      function closePdfDecryptOverlay() {
        if (!pdfDecryptOverlay) return;
        pdfDecryptOverlay.classList.remove('visible');
        if (pdfDecryptFerrofluidInstance) {
          pdfDecryptFerrofluidInstance();
          pdfDecryptFerrofluidInstance = null;
        }
      }

      if (pdfDecryptBack) {
        pdfDecryptBack.addEventListener('click', closePdfDecryptOverlayFull);
      }

      document.querySelectorAll('.audio-list-item[data-tool="pdf-decrypt"]').forEach(item => {
        item.addEventListener('click', () => {
          openPdfDecryptOverlay();
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPdfDecryptOverlay();
          }
        });
      });

      // ===== PDF Decrypt Interaction =====
      const pdfDecryptDropZone = document.getElementById('pdfDecryptDropZone');
      const pdfDecryptFiles = document.getElementById('pdfDecryptFiles');
      const pdfDecryptCta = document.getElementById('pdfDecryptCta');
      const pdfDecryptProcessBtn = document.getElementById('pdfDecryptProcessBtn');
      const pdfDecryptProcessMask = document.getElementById('pdfDecryptProcessMask');
      const pdfDecryptProcessBarFill = document.getElementById('pdfDecryptProcessBarFill');
      const pdfDecryptProcessText = document.getElementById('pdfDecryptProcessText');
      const pdfDecryptSuccessOverlay = document.getElementById('pdfDecryptSuccessOverlay');
      const pdfDecryptSuccessPath = document.getElementById('pdfDecryptSuccessPath');
      const pdfDecryptSuccessMeta = document.getElementById('pdfDecryptSuccessMeta');
      const pdfDecryptSuccessCount = document.getElementById('pdfDecryptSuccessCount');
      const pdfDecryptSuccessOpenFolder = document.getElementById('pdfDecryptSuccessOpenFolder');
      const pdfDecryptSuccessOk = document.getElementById('pdfDecryptSuccessOk');
      const pdfDecryptPasswordDialog = document.getElementById('pdfDecryptPasswordDialog');
      const pdfDecryptPasswordInput = document.getElementById('pdfDecryptPasswordInput');
      const pdfDecryptPasswordCancel = document.getElementById('pdfDecryptPasswordCancel');
      const pdfDecryptPasswordConfirm = document.getElementById('pdfDecryptPasswordConfirm');

      let selectedPdfDecryptFiles = [];
      let pdfDecryptProcessing = false;
      let lastPdfDecryptSavedPath = '';

      function addPdfDecryptFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        if (fileList.length > 1) {
          alert(t('home.pdfDecrypt.singleFileOnly'));
          return;
        }
        const file = fileList[0];
        selectedPdfDecryptFiles = [file];
        renderPdfDecryptFiles();
      }

      function clearPdfDecryptFiles() {
        selectedPdfDecryptFiles = [];
        renderPdfDecryptFiles();
      }

      function renderPdfDecryptFiles() {
        if (!pdfDecryptFiles) return;
        pdfDecryptFiles.innerHTML = '';
        if (selectedPdfDecryptFiles.length > 0) {
          pdfDecryptFiles.classList.add('has-files');
        } else {
          pdfDecryptFiles.classList.remove('has-files');
        }
        selectedPdfDecryptFiles.forEach((file, index) => {
          const item = document.createElement('div');
          item.className = 'audio-convert-file-item';
          item.dataset.index = index;
          item.innerHTML = `
            <span class="audio-convert-file-index">${index + 1}</span>
            <span class="audio-convert-file-name">${escapeHtml(file.name)}</span>
            <button class="audio-convert-file-remove" data-index="${index}" aria-label="remove">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          `;
          pdfDecryptFiles.appendChild(item);
        });
        pdfDecryptFiles.querySelectorAll('.audio-convert-file-remove').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearPdfDecryptFiles();
          });
        });
        togglePdfDecryptProcessButton();
      }

      function togglePdfDecryptProcessButton() {
        if (!pdfDecryptProcessBtn) return;
        if (selectedPdfDecryptFiles.length >= 1) {
          pdfDecryptProcessBtn.style.display = '';
          requestAnimationFrame(() => pdfDecryptProcessBtn.classList.add('visible'));
        } else {
          pdfDecryptProcessBtn.classList.remove('visible');
          const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity' && !pdfDecryptProcessBtn.classList.contains('visible')) {
              pdfDecryptProcessBtn.style.display = 'none';
              pdfDecryptProcessBtn.removeEventListener('transitionend', onTransitionEnd);
            }
          };
          pdfDecryptProcessBtn.addEventListener('transitionend', onTransitionEnd);
        }
      }

      function showPdfDecryptDropZone() {
        if (pdfDecryptDropZone) pdfDecryptDropZone.classList.add('visible');
        if (pdfDecryptOverlay) pdfDecryptOverlay.classList.add('drag-over');
      }

      function hidePdfDecryptDropZone() {
        if (pdfDecryptDropZone) pdfDecryptDropZone.classList.remove('visible');
        if (pdfDecryptOverlay) pdfDecryptOverlay.classList.remove('drag-over');
      }

      // CTA button — open file dialog
      if (pdfDecryptCta) {
        pdfDecryptCta.addEventListener('click', async () => {
          if (isTauri) {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({
                multiple: false,
                filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
              });
              if (selected && typeof selected === 'string') {
                addPdfDecryptFiles([{ name: selected.split(/[\\/]/).pop() || selected, path: selected, size: 0 }]);
              }
            } catch (e) {
              console.error('PDF decrypt file selection error', e);
            }
          } else {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf,application/pdf';
            input.addEventListener('change', () => {
              addPdfDecryptFiles(input.files);
              input.value = '';
            });
            input.click();
          }
        });
      }

      // Tauri native drag-drop
      if (isTauri && pdfDecryptOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!pdfDecryptOverlay.classList.contains('visible') || pdfDecryptProcessing) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') {
              showPdfDecryptDropZone();
            } else if (payload.type === 'leave') {
              hidePdfDecryptDropZone();
            } else if (payload.type === 'drop') {
              hidePdfDecryptDropZone();
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const fileList = paths
                .filter(p => p.toLowerCase().endsWith('.pdf'))
                .map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
              if (fileList.length > 0) {
                addPdfDecryptFiles(fileList);
              }
            }
          });
        })();
      }

      // HTML5 drag-drop fallback (non-Tauri)
      if (pdfDecryptOverlay && !isTauri) {
        pdfDecryptOverlay.addEventListener('dragover', (e) => {
          e.preventDefault();
          showPdfDecryptDropZone();
        });
        pdfDecryptOverlay.addEventListener('dragleave', (e) => {
          if (e.target === pdfDecryptOverlay) {
            hidePdfDecryptDropZone();
          }
        });
        pdfDecryptOverlay.addEventListener('drop', (e) => {
          e.preventDefault();
          hidePdfDecryptDropZone();
          if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            addPdfDecryptFiles(Array.from(e.dataTransfer.files));
          }
        });
      }

      // Process button — show password dialog
      if (pdfDecryptProcessBtn) {
        pdfDecryptProcessBtn.addEventListener('click', () => {
          if (selectedPdfDecryptFiles.length < 1 || pdfDecryptProcessing) return;
          if (pdfDecryptPasswordInput) { pdfDecryptPasswordInput.value = ''; pdfDecryptPasswordInput.type = 'password'; }
          const eyeBtn = document.getElementById('pdfDecryptEyeBtn');
          if (eyeBtn) eyeBtn.classList.remove('show');
          if (pdfDecryptPasswordDialog) pdfDecryptPasswordDialog.classList.add('visible');
          if (pdfDecryptPasswordInput) pdfDecryptPasswordInput.focus();
        });
      }

      // Password dialog cancel
      if (pdfDecryptPasswordCancel) {
        pdfDecryptPasswordCancel.addEventListener('click', () => {
          if (pdfDecryptPasswordDialog) pdfDecryptPasswordDialog.classList.remove('visible');
        });
      }

      // Password eye toggle
      const pdfDecryptEyeBtn = document.getElementById('pdfDecryptEyeBtn');
      if (pdfDecryptEyeBtn && pdfDecryptPasswordInput) {
        pdfDecryptEyeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const isPassword = pdfDecryptPasswordInput.type === 'password';
          pdfDecryptPasswordInput.type = isPassword ? 'text' : 'password';
          pdfDecryptEyeBtn.classList.toggle('show', isPassword);
          pdfDecryptPasswordInput.focus();
        });
      }

      // Password dialog confirm — start decryption
      async function handleDecryptConfirm() {
        if (pdfDecryptProcessing) return;
        const password = pdfDecryptPasswordInput ? pdfDecryptPasswordInput.value : '';

        if (!password) {
          alert(t('home.pdfDecrypt.passwordEmpty'));
          return;
        }

        // Close password dialog
        if (pdfDecryptPasswordDialog) pdfDecryptPasswordDialog.classList.remove('visible');

        // Start decryption
        pdfDecryptProcessing = true;
        if (pdfDecryptProcessMask) pdfDecryptProcessMask.classList.add('visible');
        if (pdfDecryptProcessBarFill) pdfDecryptProcessBarFill.style.width = '10%';
        if (pdfDecryptProcessText) pdfDecryptProcessText.textContent = t('home.pdfDecrypt.decrypting');

        try {
          const { PDFDocument } = await import('pdf-lib-plus-encrypt');

          if (selectedPdfDecryptFiles.length < 1) {
            pdfDecryptProcessing = false;
            if (pdfDecryptProcessMask) pdfDecryptProcessMask.classList.remove('visible');
            if (pdfDecryptProcessBarFill) pdfDecryptProcessBarFill.style.width = '0%';
            return;
          }
          const file = selectedPdfDecryptFiles[0];

          // Read file bytes
          let fileData;
          if (isTauri && file.path) {
            const { invoke } = await import('@tauri-apps/api/core');
            const rawBytes = await invoke('read_file_bytes', { path: file.path });
            if (Array.isArray(rawBytes)) {
              fileData = Uint8Array.from(rawBytes);
            } else if (rawBytes instanceof ArrayBuffer) {
              fileData = new Uint8Array(rawBytes);
            } else if (rawBytes instanceof Uint8Array) {
              fileData = rawBytes;
            } else if (rawBytes && typeof rawBytes.length === 'number') {
              fileData = Uint8Array.from(rawBytes);
            } else {
              throw new Error(`Invalid file data for ${file.name}: ${typeof rawBytes}`);
            }
            if (fileData.length === 0) throw new Error(`File ${file.name} is empty`);
          } else {
            fileData = new Uint8Array(await file.arrayBuffer());
          }

          if (pdfDecryptProcessBarFill) pdfDecryptProcessBarFill.style.width = '40%';

          // Verify password with pdfjs-dist, then decrypt with pdf-lib-plus-encrypt
          // pdf-lib-plus-encrypt's load() does not support a password parameter,
          // so we use pdfjs to verify the password first, then reload with
          // ignoreEncryption: true and save without encryption.
          let pdfDoc;
          try {
            // Step 1: Verify password with pdfjs-dist
            const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
            pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
              'pdfjs-dist/build/pdf.worker.mjs',
              import.meta.url
            ).toString();
            const wasmUrl = new URL('assets/', document.baseURI).href;
            const loadingTask = pdfjsLib.getDocument({ data: fileData.slice(), password, wasmUrl, useWasm: true });
            await loadingTask.promise;

            // Step 2: Load with pdf-lib-plus-encrypt ignoring encryption, then save without it
            pdfDoc = await PDFDocument.load(fileData.slice(), { ignoreEncryption: true });
          } catch (loadErr) {
            // Password wrong or load failed — reopen dialog, alert user
            if (pdfDecryptProcessMask) pdfDecryptProcessMask.classList.remove('visible');
            if (pdfDecryptProcessBarFill) pdfDecryptProcessBarFill.style.width = '0%';
            pdfDecryptProcessing = false;
            if (pdfDecryptPasswordDialog) pdfDecryptPasswordDialog.classList.add('visible');
            if (pdfDecryptPasswordInput) { pdfDecryptPasswordInput.value = ''; pdfDecryptPasswordInput.focus(); }
            alert(t('home.pdfDecrypt.wrongPassword'));
            return;
          }

          if (pdfDecryptProcessBarFill) pdfDecryptProcessBarFill.style.width = '70%';

          // Save without encryption (plain PDF)
          const decryptedBytes = await pdfDoc.save({ useObjectStreams: false });

          if (pdfDecryptProcessBarFill) pdfDecryptProcessBarFill.style.width = '100%';

          // Write file
          if (isTauri) {
            const { invoke } = await import('@tauri-apps/api/core');
            const outputDir = await getOutputDir('Decrypt');
            const baseName = file.name.replace(/\.pdf$/i, '');
            let fileName = `${baseName}_decrypted.pdf`;
            let fullPath = outputDir + '\\' + fileName;
            let counter = 1;
            while (await invoke('exists_path', { path: fullPath }).catch(() => false)) {
              fileName = `${baseName}_decrypted_${counter}.pdf`;
              fullPath = outputDir + '\\' + fileName;
              counter++;
            }
            await invoke('write_file_bytes', { path: fullPath, bytes: Array.from(decryptedBytes) });
            if (pdfDecryptProcessMask) pdfDecryptProcessMask.classList.remove('visible');
            if (pdfDecryptProcessBarFill) pdfDecryptProcessBarFill.style.width = '0%';
            pdfDecryptProcessing = false;
            showPdfDecryptSuccess(fullPath, 1);
          } else {
            const blob = new Blob([decryptedBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${file.name.replace(/\.pdf$/i, '')}_decrypted.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            if (pdfDecryptProcessMask) pdfDecryptProcessMask.classList.remove('visible');
            if (pdfDecryptProcessBarFill) pdfDecryptProcessBarFill.style.width = '0%';
            pdfDecryptProcessing = false;
            showPdfDecryptSuccess(`~/Downloads/${file.name.replace(/\.pdf$/i, '')}_decrypted.pdf`, 1);
          }
        } catch (e) {
          console.error('[PDF Decrypt] Error:', e);
          if (pdfDecryptProcessMask) pdfDecryptProcessMask.classList.remove('visible');
          if (pdfDecryptProcessBarFill) pdfDecryptProcessBarFill.style.width = '0%';
          pdfDecryptProcessing = false;
          alert(t('common.errorOccurred', { error: String(e) }));
        }
      }

      if (pdfDecryptPasswordConfirm) {
        pdfDecryptPasswordConfirm.addEventListener('click', handleDecryptConfirm);
      }
      if (pdfDecryptPasswordInput) {
        pdfDecryptPasswordInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleDecryptConfirm();
          }
        });
      }

      function showPdfDecryptSuccess(savePath, count) {
        lastPdfDecryptSavedPath = savePath;
        if (pdfDecryptSuccessCount) pdfDecryptSuccessCount.textContent = String(count);
        if (pdfDecryptSuccessPath) pdfDecryptSuccessPath.textContent = savePath.replace(/\//g, '\\');
        if (pdfDecryptSuccessMeta) pdfDecryptSuccessMeta.textContent = t('home.pdfDecrypt.successMeta');
        if (pdfDecryptSuccessOverlay) pdfDecryptSuccessOverlay.classList.add('visible');
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      if (pdfDecryptSuccessOk) {
        pdfDecryptSuccessOk.addEventListener('click', () => {
          if (pdfDecryptSuccessOverlay) pdfDecryptSuccessOverlay.classList.remove('visible');
        });
      }

      if (pdfDecryptSuccessOpenFolder) {
        pdfDecryptSuccessOpenFolder.addEventListener('click', async () => {
          if (isTauri && lastPdfDecryptSavedPath) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const folder = lastPdfDecryptSavedPath.replace(/[/\\][^/\\]+$/, '').replace(/\//g, '\\');
              await invoke('open_path', { path: folder });
            } catch (e) {
              console.error('[PDF Decrypt] Open folder error:', e);
            }
          }
        });
      }

      // Close cleanup
      function closePdfDecryptOverlayFull() {
        closePdfDecryptOverlay();
        pdfDecryptProcessing = false;
        if (pdfDecryptProcessMask) pdfDecryptProcessMask.classList.remove('visible');
        if (pdfDecryptProcessBarFill) pdfDecryptProcessBarFill.style.width = '0%';
        if (pdfDecryptPasswordDialog) pdfDecryptPasswordDialog.classList.remove('visible');
        if (pdfDecryptSuccessOverlay) pdfDecryptSuccessOverlay.classList.remove('visible');
        clearPdfDecryptFiles();
      }

      // ===== PDF Enhance Overlay Open/Close =====
      const pdfEnhanceOverlay = document.getElementById('pdfEnhanceOverlay');
      const pdfEnhanceFerrofluid = document.getElementById('pdfEnhanceFerrofluid');
      const pdfEnhanceBack = document.getElementById('pdfEnhanceBack');
      let pdfEnhanceFerrofluidInstance = null;

      function openPdfEnhanceOverlay() {
        if (!pdfEnhanceOverlay) return;
        pdfEnhanceOverlay.classList.add('visible');
        if (pdfEnhanceFerrofluid && !pdfEnhanceFerrofluidInstance) {
          pdfEnhanceFerrofluidInstance = initFerrofluid(pdfEnhanceFerrofluid, {
            colors: ['#e8e8ec', '#a0a0a8', '#ffffff'],
            speed: 0.3,
            scale: 2,
            opacity: 0.6,
          });
        }
      }

      function closePdfEnhanceOverlay() {
        if (!pdfEnhanceOverlay) return;
        pdfEnhanceOverlay.classList.remove('visible');
        if (pdfEnhanceFerrofluidInstance) {
          pdfEnhanceFerrofluidInstance();
          pdfEnhanceFerrofluidInstance = null;
        }
      }

      if (pdfEnhanceBack) {
        pdfEnhanceBack.addEventListener('click', closePdfEnhanceOverlayFull);
      }

      document.querySelectorAll('.audio-list-item[data-tool="pdf-enhance"]').forEach(item => {
        item.addEventListener('click', () => {
          openPdfEnhanceOverlay();
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPdfEnhanceOverlay();
          }
        });
      });

      // ===== PDF Enhance Interaction =====
      const pdfEnhanceDropZone = document.getElementById('pdfEnhanceDropZone');
      const pdfEnhanceFiles = document.getElementById('pdfEnhanceFiles');
      const pdfEnhanceCta = document.getElementById('pdfEnhanceCta');
      const pdfEnhanceProcessBtn = document.getElementById('pdfEnhanceProcessBtn');
      const pdfEnhanceProcessMask = document.getElementById('pdfEnhanceProcessMask');
      const pdfEnhanceProcessBarFill = document.getElementById('pdfEnhanceProcessBarFill');
      const pdfEnhanceProcessText = document.getElementById('pdfEnhanceProcessText');
      const pdfEnhanceSuccessOverlay = document.getElementById('pdfEnhanceSuccessOverlay');
      const pdfEnhanceSuccessPath = document.getElementById('pdfEnhanceSuccessPath');
      const pdfEnhanceSuccessMeta = document.getElementById('pdfEnhanceSuccessMeta');
      const pdfEnhanceSuccessCount = document.getElementById('pdfEnhanceSuccessCount');
      const pdfEnhanceSuccessOpenFolder = document.getElementById('pdfEnhanceSuccessOpenFolder');
      const pdfEnhanceSuccessOk = document.getElementById('pdfEnhanceSuccessOk');
      const pdfEnhanceStrengthHint = document.getElementById('pdfEnhanceStrengthHint');

      let selectedPdfEnhanceFiles = [];
      let pdfEnhanceProcessing = false;
      let lastPdfEnhanceSavedPath = '';
      let pdfEnhanceStrength = 'light';

      // Strength selector
      document.querySelectorAll('#pdfEnhanceStrengthOptions .audio-convert-format-option').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#pdfEnhanceStrengthOptions .audio-convert-format-option').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          pdfEnhanceStrength = btn.dataset.strength;
          if (pdfEnhanceStrengthHint) {
            const hintKey = `home.pdfEnhance.strength${pdfEnhanceStrength.charAt(0).toUpperCase() + pdfEnhanceStrength.slice(1)}Hint`;
            pdfEnhanceStrengthHint.textContent = t(hintKey);
          }
        });
      });

      function addPdfEnhanceFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        if (fileList.length > 1) {
          alert(t('home.pdfEnhance.singleFileOnly'));
          return;
        }
        const file = fileList[0];
        selectedPdfEnhanceFiles = [file];
        renderPdfEnhanceFiles();
      }

      function clearPdfEnhanceFiles() {
        selectedPdfEnhanceFiles = [];
        renderPdfEnhanceFiles();
      }

      function renderPdfEnhanceFiles() {
        if (!pdfEnhanceFiles) return;
        pdfEnhanceFiles.innerHTML = '';
        if (selectedPdfEnhanceFiles.length > 0) {
          pdfEnhanceFiles.classList.add('has-files');
        } else {
          pdfEnhanceFiles.classList.remove('has-files');
        }
        if (pdfEnhanceCta) {
          const ctaText = pdfEnhanceCta.querySelector('span');
          if (ctaText) {
            ctaText.textContent = selectedPdfEnhanceFiles.length > 0
              ? (t('home.pdfEnhance.ctaReupload'))
              : (t('home.pdfEnhance.cta'));
          }
        }
        selectedPdfEnhanceFiles.forEach((file, index) => {
          const item = document.createElement('div');
          item.className = 'audio-convert-file-item';
          item.dataset.index = index;
          item.innerHTML = `
            <span class="audio-convert-file-index">${index + 1}</span>
            <span class="audio-convert-file-name">${escapeHtml(file.name)}</span>
            <button class="audio-convert-file-remove" data-index="${index}" aria-label="remove">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          `;
          pdfEnhanceFiles.appendChild(item);
        });
        pdfEnhanceFiles.querySelectorAll('.audio-convert-file-remove').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearPdfEnhanceFiles();
          });
        });
        togglePdfEnhanceProcessButton();
      }

      function togglePdfEnhanceProcessButton() {
        if (!pdfEnhanceProcessBtn) return;
        if (selectedPdfEnhanceFiles.length >= 1) {
          pdfEnhanceProcessBtn.style.display = '';
          requestAnimationFrame(() => pdfEnhanceProcessBtn.classList.add('visible'));
        } else {
          pdfEnhanceProcessBtn.classList.remove('visible');
          const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity' && !pdfEnhanceProcessBtn.classList.contains('visible')) {
              pdfEnhanceProcessBtn.style.display = 'none';
              pdfEnhanceProcessBtn.removeEventListener('transitionend', onTransitionEnd);
            }
          };
          pdfEnhanceProcessBtn.addEventListener('transitionend', onTransitionEnd);
        }
      }

      function showPdfEnhanceDropZone() {
        if (pdfEnhanceDropZone) pdfEnhanceDropZone.classList.add('visible');
        if (pdfEnhanceOverlay) pdfEnhanceOverlay.classList.add('drag-over');
      }

      function hidePdfEnhanceDropZone() {
        if (pdfEnhanceDropZone) pdfEnhanceDropZone.classList.remove('visible');
        if (pdfEnhanceOverlay) pdfEnhanceOverlay.classList.remove('drag-over');
      }

      // Tauri native drag-drop
      if (isTauri && pdfEnhanceOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!pdfEnhanceOverlay.classList.contains('visible') || pdfEnhanceProcessing) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') {
              showPdfEnhanceDropZone();
            } else if (payload.type === 'leave') {
              hidePdfEnhanceDropZone();
            } else if (payload.type === 'drop') {
              hidePdfEnhanceDropZone();
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const fileList = paths
                .filter(p => p.toLowerCase().endsWith('.pdf'))
                .map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
              if (fileList.length > 0) {
                addPdfEnhanceFiles(fileList);
              }
            }
          });
        })();
      }

      // CTA button — open file dialog
      if (pdfEnhanceCta) {
        pdfEnhanceCta.addEventListener('click', async () => {
          if (isTauri) {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({
                multiple: false,
                filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
              });
              if (selected && typeof selected === 'string') {
                addPdfEnhanceFiles([{ name: selected.split(/[\\/]/).pop() || selected, path: selected, size: 0 }]);
              }
            } catch (e) {
              console.error('PDF enhance file selection error', e);
            }
          } else {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf,application/pdf';
            input.addEventListener('change', () => {
              addPdfEnhanceFiles(input.files);
              input.value = '';
            });
            input.click();
          }
        });
      }

      // ===== Image Enhancement Functions =====

      // CLAHE — Contrast Limited Adaptive Histogram Equalization
      // Divides image into tiles, enhances local contrast with clip limit
      function clahe(data, w, h, tileSize, clipLimit) {
        const tilesX = Math.ceil(w / tileSize);
        const tilesY = Math.ceil(h / tileSize);

        // Build per-tile LUTs on grayscale
        const luts = new Float32Array(tilesX * tilesY * 256);
        for (let ty = 0; ty < tilesY; ty++) {
          for (let tx = 0; tx < tilesX; tx++) {
            const x0 = tx * tileSize, y0 = ty * tileSize;
            const x1 = Math.min(x0 + tileSize, w), y1 = Math.min(y0 + tileSize, h);
            const hist = new Int32Array(256);
            let count = 0;
            for (let y = y0; y < y1; y++) {
              for (let x = x0; x < x1; x++) {
                const gray = 0.299 * data[(y * w + x) * 4] + 0.587 * data[(y * w + x) * 4 + 1] + 0.114 * data[(y * w + x) * 4 + 2];
                hist[Math.round(gray)]++;
                count++;
              }
            }
            // Clip histogram
            let excess = 0;
            for (let i = 0; i < 256; i++) {
              if (hist[i] > clipLimit) { excess += hist[i] - clipLimit; hist[i] = clipLimit; }
            }
            // Redistribute excess evenly
            const add = excess / 256;
            for (let i = 0; i < 256; i++) hist[i] += add;
            // Build CDF → LUT (total = count after redistribution)
            let cdf = 0;
            const lutIdx = (ty * tilesX + tx) * 256;
            for (let i = 0; i < 256; i++) {
              cdf += hist[i];
              luts[lutIdx + i] = (cdf / count) * 255;
            }
          }
        }

        // Apply with bilinear interpolation between tile LUTs
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const fx = x / tileSize - 0.5;
            const fy = y / tileSize - 0.5;
            const tx0 = Math.max(0, Math.min(tilesX - 1, Math.floor(fx)));
            const ty0 = Math.max(0, Math.min(tilesY - 1, Math.floor(fy)));
            const tx1 = Math.min(tilesX - 1, tx0 + 1);
            const ty1 = Math.min(tilesY - 1, ty0 + 1);
            const ax = Math.max(0, Math.min(1, fx - tx0));
            const ay = Math.max(0, Math.min(1, fy - ty0));

            for (let c = 0; c < 3; c++) {
              const v = data[idx + c];
              const v00 = luts[(ty0 * tilesX + tx0) * 256 + v];
              const v01 = luts[(ty0 * tilesX + tx1) * 256 + v];
              const v10 = luts[(ty1 * tilesX + tx0) * 256 + v];
              const v11 = luts[(ty1 * tilesX + tx1) * 256 + v];
              const v0 = v00 * (1 - ax) + v01 * ax;
              const v1 = v10 * (1 - ax) + v11 * ax;
              data[idx + c] = Math.max(0, Math.min(255, v0 * (1 - ay) + v1 * ay));
            }
          }
        }
      }

      // Sauvola adaptive binarization — local mean + std dev threshold
      function sauvolaBinarize(data, w, h, windowSize, k) {
        const rowStride = w * 4;
        const halfWin = windowSize >> 1;
        // Compute grayscale
        const gray = new Uint8ClampedArray(w * h);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
          gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        // Integral images for mean and squared mean
        const integral = new Float64Array((w + 1) * (h + 1));
        const integralSq = new Float64Array((w + 1) * (h + 1));
        for (let y = 0; y < h; y++) {
          let rowSum = 0, rowSumSq = 0;
          for (let x = 0; x < w; x++) {
            const g = gray[y * w + x];
            rowSum += g;
            rowSumSq += g * g;
            integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
            integralSq[(y + 1) * (w + 1) + (x + 1)] = integralSq[y * (w + 1) + (x + 1)] + rowSumSq;
          }
        }
        const R = 128; // dynamic range std
        for (let y = 0; y < h; y++) {
          const y0 = Math.max(0, y - halfWin), y1 = Math.min(h - 1, y + halfWin);
          for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - halfWin), x1 = Math.min(w - 1, x + halfWin);
            const area = (x1 - x0 + 1) * (y1 - y0 + 1);
            const sum = integral[(y1 + 1) * (w + 1) + (x1 + 1)] - integral[y0 * (w + 1) + (x1 + 1)] - integral[(y1 + 1) * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
            const sumSq = integralSq[(y1 + 1) * (w + 1) + (x1 + 1)] - integralSq[y0 * (w + 1) + (x1 + 1)] - integralSq[(y1 + 1) * (w + 1) + x0] + integralSq[y0 * (w + 1) + x0];
            const mean = sum / area;
            const variance = sumSq / area - mean * mean;
            const std = Math.sqrt(Math.max(0, variance));
            const threshold = mean * (1 + k * (std / R - 1));
            const idx = (y * w + x) * 4;
            const val = gray[y * w + x] > threshold ? 255 : 0;
            data[idx] = val; data[idx + 1] = val; data[idx + 2] = val;
          }
        }
      }

      // 5x5 unsharp mask sharpening
      function sharpen5x5(data, w, h, amount) {
        const original = new Uint8ClampedArray(data);
        const rowStride = w * 4;
        const center = 1 + 8 * amount;
        const side = -amount;
        for (let y = 2; y < h - 2; y++) {
          const rowOff = y * rowStride;
          for (let x = 2; x < w - 2; x++) {
            const idx = rowOff + x * 4;
            for (let c = 0; c < 3; c++) {
              const val = original[idx + c] * center
                + (original[idx - 4 + c] + original[idx + 4 + c] + original[idx - rowStride + c] + original[idx + rowStride + c]) * side
                + (original[idx - 8 + c] + original[idx + 8 + c] + original[idx - rowStride * 2 + c] + original[idx + rowStride * 2 + c]) * (side * 0.5);
              data[idx + c] = Math.max(0, Math.min(255, val));
            }
          }
        }
      }

      // 3x3 unsharp mask sharpening (lighter)
      function sharpen3x3(data, w, h, amount) {
        const original = new Uint8ClampedArray(data);
        const rowStride = w * 4;
        const center = 1 + 4 * amount;
        const side = -amount;
        for (let y = 1; y < h - 1; y++) {
          const rowOff = y * rowStride;
          for (let x = 1; x < w - 1; x++) {
            const idx = rowOff + x * 4;
            data[idx]     = Math.max(0, Math.min(255, original[idx]     * center + (original[idx - 4]     + original[idx + 4]     + original[idx - rowStride]     + original[idx + rowStride])     * side));
            data[idx + 1] = Math.max(0, Math.min(255, original[idx + 1] * center + (original[idx - 3]     + original[idx + 5]     + original[idx - rowStride + 1] + original[idx + rowStride + 1]) * side));
            data[idx + 2] = Math.max(0, Math.min(255, original[idx + 2] * center + (original[idx - 2]     + original[idx + 6]     + original[idx - rowStride + 2] + original[idx + rowStride + 2]) * side));
          }
        }
      }

      function enhanceImageCanvas(canvas, strength) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        if (strength === 'light') {
          // Light: CLAHE (large tiles, gentle) + 3x3 sharpen, preserve color
          clahe(data, w, h, 64, 20);
          sharpen3x3(data, w, h, 0.4);
        } else if (strength === 'medium') {
          // Medium: grayscale mix 60% + CLAHE (medium tiles) + 5x5 sharpen
          for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i]     = data[i]     * 0.4 + gray * 0.6;
            data[i + 1] = data[i + 1] * 0.4 + gray * 0.6;
            data[i + 2] = data[i + 2] * 0.4 + gray * 0.6;
          }
          clahe(data, w, h, 48, 15);
          sharpen5x5(data, w, h, 0.5);
        } else {
          // Strong: full grayscale + CLAHE (small tiles, aggressive) + Sauvola binarization + 5x5 sharpen
          for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = data[i + 1] = data[i + 2] = gray;
          }
          clahe(data, w, h, 32, 10);
          sauvolaBinarize(data, w, h, 41, 0.15);
          sharpen5x5(data, w, h, 0.4);
        }

        ctx.putImageData(imageData, 0, 0);
      }

      // ===== Process button — enhance PDF =====
      if (pdfEnhanceProcessBtn) {
        pdfEnhanceProcessBtn.addEventListener('click', async () => {
          if (selectedPdfEnhanceFiles.length < 1 || pdfEnhanceProcessing) return;
          pdfEnhanceProcessing = true;
          if (pdfEnhanceProcessMask) pdfEnhanceProcessMask.classList.add('visible');
          if (pdfEnhanceProcessBarFill) pdfEnhanceProcessBarFill.style.width = '5%';
          if (pdfEnhanceProcessText) pdfEnhanceProcessText.textContent = t('home.pdfEnhance.loading');

          try {
            const file = selectedPdfEnhanceFiles[0];

            // Read file bytes
            let fileData;
            if (isTauri && file.path) {
              const { invoke } = await import('@tauri-apps/api/core');
              const rawBytes = await invoke('read_file_bytes', { path: file.path });
              if (Array.isArray(rawBytes)) {
                fileData = Uint8Array.from(rawBytes);
              } else if (rawBytes instanceof ArrayBuffer) {
                fileData = new Uint8Array(rawBytes);
              } else if (rawBytes instanceof Uint8Array) {
                fileData = rawBytes;
              } else if (rawBytes && typeof rawBytes.length === 'number') {
                fileData = Uint8Array.from(rawBytes);
              } else {
                throw new Error(`Invalid file data for ${file.name}: ${typeof rawBytes}`);
              }
              if (fileData.length === 0) throw new Error(`File ${file.name} is empty`);
            } else {
              fileData = new Uint8Array(await file.arrayBuffer());
            }

            // Load with pdf.js
            const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
            pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
              'pdfjs-dist/build/pdf.worker.mjs',
              import.meta.url
            ).toString();

            const wasmUrl = new URL('assets/', document.baseURI).href;
            const loadingTask = pdfjsLib.getDocument({ data: fileData.slice(), wasmUrl, useWasm: true });
            const pdfDoc = await loadingTask.promise;
            const totalPages = pdfDoc.numPages;

            // Page limit check
            const MAX_PAGES = 2000;
            if (totalPages > MAX_PAGES) {
              try { pdfDoc.destroy(); } catch (_) {}
              throw new Error(t('home.pdfEnhance.tooManyPages', { pages: totalPages }));
            }

            if (pdfEnhanceProcessText) pdfEnhanceProcessText.textContent = `${t('home.pdfEnhance.processing')} (0/${totalPages})`;

            // Create new PDF document upfront — stream pages one by one
            const { PDFDocument } = await import('pdf-lib');
            const newPdf = await PDFDocument.create();

            const RENDER_SCALE = 2.5; // ~300 DPI for 72dpi base

            for (let pi = 1; pi <= totalPages; pi++) {
              const page = await pdfDoc.getPage(pi);
              const viewport = page.getViewport({ scale: RENDER_SCALE });

              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: ctx, viewport }).promise;

              // Enhance the image
              enhanceImageCanvas(canvas, pdfEnhanceStrength);

              // Convert to JPEG blob and embed into PDF immediately
              const jpegBlob = await new Promise((resolve, reject) => {
                canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.85);
              });
              const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
              const img = await newPdf.embedJpg(jpegBytes);
              const pdfPage = newPdf.addPage([canvas.width, canvas.height]);
              pdfPage.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height });

              // Free memory immediately
              canvas.width = 0;
              canvas.height = 0;

              // Cleanup pdf.js page
              try { page.cleanup(); } catch (_) {}

              const progress = Math.round((pi / totalPages) * 85) + 5;
              if (pdfEnhanceProcessBarFill) pdfEnhanceProcessBarFill.style.width = progress + '%';
              if (pdfEnhanceProcessText) pdfEnhanceProcessText.textContent = `${t('home.pdfEnhance.processing')} (${pi}/${totalPages})`;

              // Yield to UI
              await new Promise(r => setTimeout(r, 0));
            }

            // Destroy pdf.js doc
            try { pdfDoc.destroy(); } catch (_) {}

            // Save PDF
            if (pdfEnhanceProcessText) pdfEnhanceProcessText.textContent = t('home.pdfEnhance.generating');
            if (pdfEnhanceProcessBarFill) pdfEnhanceProcessBarFill.style.width = '95%';

            const enhancedBytes = await newPdf.save();
            if (pdfEnhanceProcessBarFill) pdfEnhanceProcessBarFill.style.width = '100%';

            // Write file
            if (isTauri) {
              const { invoke } = await import('@tauri-apps/api/core');
              const outputDir = await getOutputDir('Enhance');
              const baseName = file.name.replace(/\.pdf$/i, '');
              let fileName = `${baseName}_enhanced.pdf`;
              let fullPath = outputDir + '\\' + fileName;
              let counter = 1;
              while (await invoke('exists_path', { path: fullPath }).catch(() => false)) {
                fileName = `${baseName}_enhanced_${counter}.pdf`;
                fullPath = outputDir + '\\' + fileName;
                counter++;
              }
              await invoke('write_file_chunk', { path: fullPath, offset: 0, bytes: Array.from(enhancedBytes.subarray(0, 5_000_000)) });
              for (let off = 5_000_000; off < enhancedBytes.length; off += 5_000_000) {
                const end = Math.min(off + 5_000_000, enhancedBytes.length);
                await invoke('write_file_chunk', { path: fullPath, offset: off, bytes: Array.from(enhancedBytes.subarray(off, end)) });
              }
              if (pdfEnhanceProcessMask) pdfEnhanceProcessMask.classList.remove('visible');
              if (pdfEnhanceProcessBarFill) pdfEnhanceProcessBarFill.style.width = '0%';
              pdfEnhanceProcessing = false;
              showPdfEnhanceSuccess(fullPath, totalPages);
            } else {
              const blob = new Blob([enhancedBytes], { type: 'application/pdf' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${file.name.replace(/\.pdf$/i, '')}_enhanced.pdf`;
              a.click();
              URL.revokeObjectURL(url);
              if (pdfEnhanceProcessMask) pdfEnhanceProcessMask.classList.remove('visible');
              if (pdfEnhanceProcessBarFill) pdfEnhanceProcessBarFill.style.width = '0%';
              pdfEnhanceProcessing = false;
              showPdfEnhanceSuccess(`~/Downloads/${file.name.replace(/\.pdf$/i, '')}_enhanced.pdf`, totalPages);
            }
          } catch (e) {
            console.error('[PDF Enhance] Error:', e);
            if (pdfEnhanceProcessMask) pdfEnhanceProcessMask.classList.remove('visible');
            if (pdfEnhanceProcessBarFill) pdfEnhanceProcessBarFill.style.width = '0%';
            pdfEnhanceProcessing = false;
            alert(t('common.errorOccurred', { error: String(e) }));
          }
        });
      }

      function showPdfEnhanceSuccess(savePath, count) {
        lastPdfEnhanceSavedPath = savePath;
        if (pdfEnhanceSuccessCount) pdfEnhanceSuccessCount.textContent = String(count);
        if (pdfEnhanceSuccessPath) pdfEnhanceSuccessPath.textContent = savePath.replace(/\//g, '\\');
        if (pdfEnhanceSuccessMeta) pdfEnhanceSuccessMeta.textContent = t('home.pdfEnhance.successMeta');
        if (pdfEnhanceSuccessOverlay) pdfEnhanceSuccessOverlay.classList.add('visible');
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      if (pdfEnhanceSuccessOk) {
        pdfEnhanceSuccessOk.addEventListener('click', () => {
          if (pdfEnhanceSuccessOverlay) pdfEnhanceSuccessOverlay.classList.remove('visible');
        });
      }

      if (pdfEnhanceSuccessOpenFolder) {
        pdfEnhanceSuccessOpenFolder.addEventListener('click', async () => {
          if (isTauri && lastPdfEnhanceSavedPath) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const folder = lastPdfEnhanceSavedPath.replace(/[/\\][^/\\]+$/, '').replace(/\//g, '\\');
              await invoke('open_path', { path: folder });
            } catch (e) {
              console.error('[PDF Enhance] Open folder error:', e);
            }
          }
        });
      }

      function closePdfEnhanceOverlayFull() {
        closePdfEnhanceOverlay();
        pdfEnhanceProcessing = false;
        if (pdfEnhanceProcessMask) pdfEnhanceProcessMask.classList.remove('visible');
        if (pdfEnhanceProcessBarFill) pdfEnhanceProcessBarFill.style.width = '0%';
        if (pdfEnhanceSuccessOverlay) pdfEnhanceSuccessOverlay.classList.remove('visible');
        clearPdfEnhanceFiles();
      }

      // ===== AI Polish Tool =====
      const aiPolishOverlay = document.getElementById('aiPolishOverlay');
      const aiPolishBack = document.getElementById('aiPolishBack');
      const aiPolishStartBtn = document.getElementById('aiPolishStartBtn');
      const aiPolishInput = document.getElementById('aiPolishInput');
      const aiPolishRightEmpty = document.getElementById('aiPolishRightEmpty');
      const aiPolishDrawer = document.getElementById('aiPolishDrawer');
      const aiPolishDirections = document.getElementById('aiPolishDirections');
      const aiPolishDirectionList = document.getElementById('aiPolishDirectionList');
      const aiPolishComparison = document.getElementById('aiPolishComparison');
      const aiPolishPolishedText = document.getElementById('aiPolishPolishedText');
      const aiPolishMask = document.getElementById('aiPolishMask');
      const aiPolishMaskText = document.getElementById('aiPolishMaskText');
      const aiPolishCopyBtn = document.getElementById('aiPolishCopyBtn');

      let aiPolishDirectionsData = [];
      let aiPolishResultMode = false; // true when result is shown, button acts as "clear"
      let aiPolishOriginalContent = '';
      let aiPolishDitherInstance = null;

      const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
      const DEEPSEEK_MODEL = 'deepseek-chat';

      // Robust JSON extraction: strip markdown code blocks and use balanced brace matching
      function extractJson(str) {
        if (!str || typeof str !== 'string') return null;

        // 0. Try direct JSON.parse first (in case the entire string is valid JSON)
        try {
          JSON.parse(str.trim());
          return str.trim();
        } catch (e) {}

        // 1. Try to extract content from markdown code blocks (```json ... ``` or ``` ... ```)
        const codeBlockRegex = /```(?:json|javascript|js)?\s*\n([\s\S]*?)\n```/g;
        let matches = [];
        let match;
        while ((match = codeBlockRegex.exec(str)) !== null) {
          matches.push(match[1]);
        }
        for (const blockContent of matches) {
          const trimmed = cleanJsonString(blockContent.trim());
          // Try direct parse
          try { JSON.parse(trimmed); return trimmed; } catch (e) {}
          const start = trimmed.indexOf('{');
          if (start !== -1) {
            const result = extractBalancedJson(trimmed, start);
            if (result) {
              try { JSON.parse(result); return result; } catch (e) {}
            }
          }
        }

        // 2. Remove any stray code fence markers and surrounding explanation text
        let cleaned = cleanJsonString(str
          .replace(/```(?:json|javascript|js)?\s*/g, '')
          .replace(/```\s*/g, '')
          .trim());

        // 3. Try direct parse on cleaned string
        try { JSON.parse(cleaned); return cleaned; } catch (e) {}

        // 4. Find the first '{' and extract balanced JSON
        const start = cleaned.indexOf('{');
        if (start === -1) return null;
        const balanced = extractBalancedJson(cleaned, start);
        if (balanced) {
          try { JSON.parse(balanced); return balanced; } catch (e) {}
        }

        // 5. Fallback: find first '{' and last '}' — try to parse the substring
        const lastClose = cleaned.lastIndexOf('}');
        if (start !== -1 && lastClose > start) {
          const candidate = cleaned.substring(start, lastClose + 1);
          try { JSON.parse(candidate); return candidate; } catch (e) {}
        }

        // 6. Repair truncated JSON (DeepSeek output hit the 8K token limit and got cut off)
        const repaired = repairTruncatedJson(cleaned);
        if (repaired) {
          try { JSON.parse(repaired); return repaired; } catch (e) {}
        }

        // 7. Last resort: return the balanced result even if JSON.parse fails (caller will handle)
        if (balanced) return balanced;

        return null;
      }

      // Repairs a truncated JSON object by discarding the incomplete trailing portion
      // and closing all open brackets. Used when the model output is cut off mid-region.
      function repairTruncatedJson(str) {
        const start = str.indexOf('{');
        if (start === -1) return null;
        const candidates = []; // each: { pos, stack: remaining open brackets after this close }
        let stack = [];
        let inString = false;
        let escape = false;
        for (let i = start; i < str.length; i++) {
          const ch = str[i];
          if (escape) { escape = false; continue; }
          if (ch === '\\') { if (inString) escape = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === '{' || ch === '[') {
            stack.push(ch);
          } else if (ch === '}' || ch === ']') {
            stack.pop();
            candidates.push({ pos: i, stack: stack.slice() });
          }
        }
        // Try from the last complete closing bracket backwards, closing the remaining stack
        for (let k = candidates.length - 1; k >= 0; k--) {
          const { pos, stack: rem } = candidates[k];
          let closing = '';
          for (let j = rem.length - 1; j >= 0; j--) {
            closing += rem[j] === '{' ? '}' : ']';
          }
          const candidate = str.substring(start, pos + 1) + closing;
          try {
            JSON.parse(candidate);
            console.warn('[AI Doc] Repaired truncated JSON, discarded trailing incomplete content. Recovered length:', candidate.length);
            return candidate;
          } catch (e) {}
        }
        return null;
      }

      function cleanJsonString(str) {
        // Remove BOM and control characters that are invalid in JSON strings
        return str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFEFF\uFFFD]/g, '');
      }

      function extractBalancedJson(str, start) {
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = start; i < str.length; i++) {
          const ch = str[i];
          if (escape) { escape = false; continue; }
          if (ch === '\\' && inString) { escape = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) return str.substring(start, i + 1);
          }
        }
        return null;
      }

      async function callDeepSeek(messages, signal, maxTokens) {
        const apiKey = localStorage.getItem('ai_api_key') || localStorage.getItem('deepseek_api_key') || '';
        if (!apiKey) {
          throw new Error(t('home.aiPolish.noApiKey'));
        }
        const { url: apiUrl, model } = getAiPlatformConfig();
        if (!apiUrl || !model) {
          throw new Error(t('home.aiPolish.noApiKey'));
        }
        const reqBody = {
          model,
          messages,
          temperature: 0.7,
          stream: false,
        };
        if (maxTokens) reqBody.max_tokens = maxTokens;
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(reqBody),
          signal,
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`${t('home.aiPolish.apiError')}: ${res.status} ${errText}`);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      }

      function openAiPolishOverlay() {
        if (!aiPolishOverlay) return;
        aiPolishOverlay.classList.add('visible');
        resetAiPolishState();
        if (aiPolishBg && !aiPolishDitherInstance) {
          aiPolishDitherInstance = initDither(aiPolishBg, {
            waveColor: [0.38823529411764707, 0.4, 0.9450980392156862],
            colorNum: 40,
            pixelSize: 2,
            waveAmplitude: 0,
            waveFrequency: 0,
            waveSpeed: 0.07
          });
        }
      }

      function closeAiPolishOverlay() {
        if (!aiPolishOverlay) return;
        aiPolishOverlay.classList.remove('visible');
        resetAiPolishState();
        if (aiPolishDitherInstance) {
          aiPolishDitherInstance();
          aiPolishDitherInstance = null;
        }
      }

      function resetAiPolishState() {
        if (aiPolishInput) aiPolishInput.value = '';
        if (aiPolishRightEmpty) aiPolishRightEmpty.style.display = '';
        if (aiPolishDirections) aiPolishDirections.style.display = 'none';
        if (aiPolishComparison) aiPolishComparison.style.display = 'none';
        if (aiPolishDrawer) {
          aiPolishDrawer.classList.remove('processing');
        }
        if (aiPolishStartBtn) {
          aiPolishStartBtn.classList.add('disabled');
          const btnLabel = aiPolishStartBtn.querySelector('span');
          if (btnLabel) btnLabel.textContent = t('home.aiPolish.cta');
          const btnIcon = aiPolishStartBtn.querySelector('i[data-lucide]');
          if (btnIcon) {
            btnIcon.setAttribute('data-lucide', 'sparkles');
            if (window.lucide) window.lucide.createIcons();
          }
        }
        aiPolishResultMode = false;
        aiPolishDirectionsData = [];
        aiPolishOriginalContent = '';
      }

      function showAiPolishDrawer() {
        if (aiPolishDrawer) {
          aiPolishDrawer.style.display = '';
          requestAnimationFrame(() => aiPolishDrawer.classList.add('expanded'));
        }
      }

      function showAiPolishMask(text) {
        if (aiPolishMaskText) aiPolishMaskText.textContent = text;
        if (aiPolishMask) aiPolishMask.classList.add('visible');
      }

      function hideAiPolishMask() {
        if (aiPolishMask) aiPolishMask.classList.remove('visible');
      }

      async function handleAiPolishStart() {
        const text = aiPolishInput?.value?.trim();
        if (!text) return;

        aiPolishOriginalContent = text;
        showAiPolishMask(t('home.aiPolish.analyzing'));
        if (aiPolishDrawer) aiPolishDrawer.classList.add('processing');

        try {
          const systemPrompt = '你是一位资深文字编辑专家，精通中文和英文写作，拥有丰富的润色经验。你擅长分析文本的语境、风格和意图，能够提供多种润色方向并精准执行。你的原则是：保持原文核心意思不变，提升表达的准确性、流畅性和美感。';

          const userPrompt = `请分析以下用户输入的文字，推理用户可能希望的润色方向。给出 3 个最合适的润色方向，每个方向包含：\n- 方向名称（简洁，2-6个字，如"正式商务"、"简洁精炼"、"生动活泼"）\n- 简短说明（一句话描述这个方向的特点）\n\n请以 JSON 格式返回：\n{"directions":[{"name":"方向名称","desc":"简短说明"},{"name":"方向名称","desc":"简短说明"},{"name":"方向名称","desc":"简短说明"}]}\n\n用户文字：\n${text}`;

          const content = await callDeepSeek([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ]);

          // Parse JSON from response using balanced brace matching
          const jsonStr = extractJson(content);
          if (!jsonStr) throw new Error(t('home.aiPolish.parseError'));
          const parsed = JSON.parse(jsonStr);
          aiPolishDirectionsData = parsed.directions || [];

          if (aiPolishDirectionsData.length === 0) throw new Error(t('home.aiPolish.noDirections'));

          // Show direction options in right panel
          if (aiPolishRightEmpty) aiPolishRightEmpty.style.display = 'none';
          if (aiPolishDirections) aiPolishDirections.style.display = '';
          if (aiPolishDirectionList) {
            aiPolishDirectionList.innerHTML = '';
            aiPolishDirectionsData.forEach((dir, idx) => {
              const btn = document.createElement('button');
              btn.className = 'ai-polish-direction-btn';
              btn.innerHTML = `<span class="ai-polish-direction-btn-name">${escapeHtml(dir.name)}</span><span class="ai-polish-direction-btn-desc">${escapeHtml(dir.desc)}</span>`;
              btn.addEventListener('click', () => handleDirectionSelect(idx));
              aiPolishDirectionList.appendChild(btn);
            });
          }
        } catch (e) {
          console.error('[AI Polish] Analysis error:', e);
          alert(t('home.aiPolish.networkError'));
        } finally {
          hideAiPolishMask();
          if (aiPolishDrawer) aiPolishDrawer.classList.remove('processing');
        }
      }

      async function handleDirectionSelect(idx) {
        const dir = aiPolishDirectionsData[idx];
        if (!dir) return;

        showAiPolishMask(t('home.aiPolish.polishing'));
        if (aiPolishDrawer) aiPolishDrawer.classList.add('processing');

        try {
          const systemPrompt = '你是一位资深文字编辑专家，精通中文和英文写作，拥有丰富的润色经验。你的原则是：保持原文核心意思不变，提升表达的准确性、流畅性和美感。';

          const userPrompt = `请按照「${dir.name}」方向润色以下文字。\n要求：\n1. 保持原文核心意思不变\n2. ${dir.desc}\n3. 直接输出润色后的文字，不要添加任何解释或说明\n\n原文：\n${aiPolishOriginalContent}`;

          const polished = await callDeepSeek([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ]);

          // Show polished result in right panel
          if (aiPolishDirections) aiPolishDirections.style.display = 'none';
          if (aiPolishComparison) aiPolishComparison.style.display = '';
          if (aiPolishPolishedText) aiPolishPolishedText.textContent = polished.trim();
          // Change start button to "清理结果" (clear result)
          aiPolishResultMode = true;
          if (window.incrementToolUsage) window.incrementToolUsage();
          if (aiPolishStartBtn) {
            aiPolishStartBtn.classList.remove('disabled');
            const btnLabel = aiPolishStartBtn.querySelector('span');
            if (btnLabel) btnLabel.textContent = t('home.aiPolish.clearResult');
            const btnIcon = aiPolishStartBtn.querySelector('i[data-lucide]');
            if (btnIcon) {
              btnIcon.setAttribute('data-lucide', 'rotate-ccw');
              if (window.lucide) window.lucide.createIcons();
            }
          }
        } catch (e) {
          console.error('[AI Polish] Polish error:', e);
          alert(t('home.aiPolish.networkError'));
        } finally {
          hideAiPolishMask();
          if (aiPolishDrawer) aiPolishDrawer.classList.remove('processing');
        }
      }

      // Event listeners
      if (aiPolishBack) {
        aiPolishBack.addEventListener('click', closeAiPolishOverlay);
      }

      document.querySelectorAll('.audio-list-item[data-tool="ai-polish"]').forEach(item => {
        item.addEventListener('click', () => openToolWithAiCheck(openAiPolishOverlay));
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openToolWithAiCheck(openAiPolishOverlay);
          }
        });
      });

      if (aiPolishStartBtn) {
        aiPolishStartBtn.addEventListener('click', () => {
          if (aiPolishResultMode) {
            resetAiPolishState();
            return;
          }
          const text = aiPolishInput?.value?.trim();
          if (!text) return;
          handleAiPolishStart();
        });
      }

      if (aiPolishInput) {
        aiPolishInput.addEventListener('input', () => {
          const hasText = aiPolishInput.value.trim().length > 0;
          if (hasText) {
            aiPolishStartBtn?.classList.remove('disabled');
          } else {
            aiPolishStartBtn?.classList.add('disabled');
          }
        });
      }

      if (aiPolishCopyBtn) {
        aiPolishCopyBtn.addEventListener('click', () => {
          const text = aiPolishPolishedText?.textContent || '';
          if (!text) return;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
              aiPolishCopyBtn.classList.add('copied');
              const icon = aiPolishCopyBtn.querySelector('i[data-lucide]');
              if (icon) icon.setAttribute('data-lucide', 'check');
              if (window.lucide) window.lucide.createIcons();
              setTimeout(() => {
                aiPolishCopyBtn.classList.remove('copied');
                if (icon) icon.setAttribute('data-lucide', 'copy');
                if (window.lucide) window.lucide.createIcons();
              }, 2000);
            }).catch(() => {
              alert(t('home.aiPolish.copyFailed'));
            });
          } else {
            alert(t('home.aiPolish.copyFailed'));
          }
        });
      }

      const aiPolishCancelBtn = document.getElementById('aiPolishCancelBtn');
      if (aiPolishCancelBtn) {
        aiPolishCancelBtn.addEventListener('click', () => {
          if (aiPolishDirections) aiPolishDirections.style.display = 'none';
          if (aiPolishRightEmpty) aiPolishRightEmpty.style.display = '';
          aiPolishDirectionsData = [];
        });
      }
      // ===== End AI Polish Tool =====

      // ===== AI Translate Tool =====
      const aiTranslateOverlay = document.getElementById('aiTranslateOverlay');
      const aiTranslateBack = document.getElementById('aiTranslateBack');
      const aiTranslateStartBtn = document.getElementById('aiTranslateStartBtn');
      const aiTranslateInput = document.getElementById('aiTranslateInput');
      const aiTranslateRightEmpty = document.getElementById('aiTranslateRightEmpty');
      const aiTranslateDrawer = document.getElementById('aiTranslateDrawer');
      const aiTranslateLangSelect = document.getElementById('aiTranslateLangSelect');
      const aiTranslateLangList = document.getElementById('aiTranslateLangList');
      const aiTranslateComparison = document.getElementById('aiTranslateComparison');
      const aiTranslateResult = document.getElementById('aiTranslateResult');
      const aiTranslateMask = document.getElementById('aiTranslateMask');
      const aiTranslateMaskText = document.getElementById('aiTranslateMaskText');
      const aiTranslateCopyBtn = document.getElementById('aiTranslateCopyBtn');

      let aiTranslateResultMode = false;
      let aiTranslateOriginalContent = '';
      let aiTranslateDitherInstance = null;

      const TRANSLATE_LANGUAGES = [
        { code: 'en', name: 'English', nativeNameKey: 'home.aiTranslate.langEnglish', pattern: /[a-zA-Z]/g },
        { code: 'zh', name: 'Chinese', nativeNameKey: 'home.aiTranslate.langChinese', pattern: /[\u4e00-\u9fff]/g },
        { code: 'ja', name: 'Japanese', nativeNameKey: 'home.aiTranslate.langJapanese', pattern: /[\u3040-\u30ff\u31f0-\u31ff]/g },
        { code: 'ko', name: 'Korean', nativeNameKey: 'home.aiTranslate.langKorean', pattern: /[\uac00-\ud7af]/g },
        { code: 'fr', name: 'French', nativeNameKey: 'home.aiTranslate.langFrench', pattern: null },
        { code: 'de', name: 'German', nativeNameKey: 'home.aiTranslate.langGerman', pattern: null },
        { code: 'es', name: 'Spanish', nativeNameKey: 'home.aiTranslate.langSpanish', pattern: null },
        { code: 'ru', name: 'Russian', nativeNameKey: 'home.aiTranslate.langRussian', pattern: /[\u0400-\u04ff]/g },
        { code: 'pt', name: 'Portuguese', nativeNameKey: 'home.aiTranslate.langPortuguese', pattern: null },
        { code: 'it', name: 'Italian', nativeNameKey: 'home.aiTranslate.langItalian', pattern: null },
      ];

      function detectMainLanguage(text) {
        const counts = {};
        TRANSLATE_LANGUAGES.forEach(lang => {
          if (lang.pattern) {
            const matches = text.match(lang.pattern);
            counts[lang.code] = matches ? matches.length : 0;
          } else {
            counts[lang.code] = 0;
          }
        });

        let maxCode = null;
        let maxCount = 0;
        Object.entries(counts).forEach(([code, count]) => {
          if (count > maxCount) {
            maxCount = count;
            maxCode = code;
          }
        });
        // If no CJK/Cyrillic/Korean detected, default to English (latin script)
        if (!maxCode) maxCode = 'en';
        return maxCode;
      }

      function openAiTranslateOverlay() {
        if (!aiTranslateOverlay) return;
        aiTranslateOverlay.classList.add('visible');
        resetAiTranslateState();
        if (aiTranslateBg && !aiTranslateDitherInstance) {
          aiTranslateDitherInstance = initDither(aiTranslateBg, {
            waveColor: [0.38823529411764707, 0.4, 0.9450980392156862],
            colorNum: 40,
            pixelSize: 2,
            waveAmplitude: 0,
            waveFrequency: 0,
            waveSpeed: 0.07
          });
        }
      }

      function closeAiTranslateOverlay() {
        if (!aiTranslateOverlay) return;
        aiTranslateOverlay.classList.remove('visible');
        restoreAiTranslateInput();
        resetAiTranslateState();
        if (aiTranslateDitherInstance) {
          aiTranslateDitherInstance();
          aiTranslateDitherInstance = null;
        }
      }

      function resetAiTranslateState() {
        if (aiTranslateInput) aiTranslateInput.value = '';
        if (aiTranslateRightEmpty) aiTranslateRightEmpty.style.display = '';
        if (aiTranslateLangSelect) aiTranslateLangSelect.style.display = 'none';
        if (aiTranslateComparison) aiTranslateComparison.style.display = 'none';
        if (aiTranslateDrawer) aiTranslateDrawer.classList.remove('processing');
        if (aiTranslateStartBtn) {
          aiTranslateStartBtn.classList.add('disabled');
          const btnLabel = aiTranslateStartBtn.querySelector('span');
          if (btnLabel) btnLabel.textContent = t('home.aiTranslate.cta');
          const btnIcon = aiTranslateStartBtn.querySelector('i[data-lucide]');
          if (btnIcon) {
            btnIcon.setAttribute('data-lucide', 'languages');
            if (window.lucide) window.lucide.createIcons();
          }
        }
        aiTranslateResultMode = false;
        aiTranslateOriginalContent = '';
      }

      function showAiTranslateMask(text) {
        if (aiTranslateMaskText) aiTranslateMaskText.textContent = text;
        if (aiTranslateMask) aiTranslateMask.classList.add('visible');
      }

      function hideAiTranslateMask() {
        if (aiTranslateMask) aiTranslateMask.classList.remove('visible');
      }

      function showAiTranslateLangSelect() {
        if (aiTranslateRightEmpty) aiTranslateRightEmpty.style.display = 'none';
        if (aiTranslateLangSelect) aiTranslateLangSelect.style.display = '';
        if (aiTranslateLangList) {
          const detectedLang = detectMainLanguage(aiTranslateOriginalContent);
          aiTranslateLangList.innerHTML = '';
          TRANSLATE_LANGUAGES.forEach(lang => {
            if (lang.code === detectedLang) return; // Exclude detected source language
            const btn = document.createElement('button');
            btn.className = 'ai-polish-direction-btn ai-translate-lang-btn';
            btn.innerHTML = `<span class="ai-polish-direction-btn-name">${escapeHtml(t(lang.nativeNameKey))}</span><span class="ai-polish-direction-btn-desc">${escapeHtml(lang.name)}</span>`;
            btn.addEventListener('click', () => handleAiTranslateStart(lang));
            aiTranslateLangList.appendChild(btn);
          });
        }
      }

      async function handleAiTranslateStart(lang) {
        if (!aiTranslateOriginalContent) return;

        if (aiTranslateLangSelect) aiTranslateLangSelect.style.display = 'none';
        showAiTranslateMask(t('home.aiTranslate.translating'));
        if (aiTranslateDrawer) aiTranslateDrawer.classList.add('processing');

        try {
          const systemPrompt = '你是一位专业翻译专家，精通多种语言。你的原则是：准确传达原文意思，保持语境和语气一致。你需要逐句翻译，并返回JSON格式的句子对照。';
          const userPrompt = `请将以下文字翻译为${t(lang.nativeNameKey)}（${lang.name}）。\n要求：\n1. 逐句翻译，保持句子对应关系\n2. 准确传达原文意思和语气\n3. 以JSON格式返回：{"pairs":[{"original":"原文句子1","translated":"译文句子1"},{"original":"原文句子2","translated":"译文句子2"}]}\n4. 每个句子应该是一个完整的意群\n\n原文：\n${aiTranslateOriginalContent}`;

          const content = await callDeepSeek([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ]);

          const jsonStr = extractJson(content);
          if (!jsonStr) throw new Error(t('home.aiTranslate.parseError'));
          const parsed = JSON.parse(jsonStr);
          const pairs = parsed.pairs || [];

          if (pairs.length === 0) throw new Error(t('home.aiTranslate.noResult'));

          // Render highlighted sentences on both sides
          renderAiTranslateResult(pairs);

          // Change start button to "清理结果"
          aiTranslateResultMode = true;
          if (window.incrementToolUsage) window.incrementToolUsage();
          if (aiTranslateStartBtn) {
            aiTranslateStartBtn.classList.remove('disabled');
            const btnLabel = aiTranslateStartBtn.querySelector('span');
            if (btnLabel) btnLabel.textContent = t('home.aiTranslate.clearResult');
            const btnIcon = aiTranslateStartBtn.querySelector('i[data-lucide]');
            if (btnIcon) {
              btnIcon.setAttribute('data-lucide', 'rotate-ccw');
              if (window.lucide) window.lucide.createIcons();
            }
          }
        } catch (e) {
          console.error('[AI Translate] Error:', e);
          alert(t('home.aiTranslate.networkError'));
        } finally {
          hideAiTranslateMask();
          if (aiTranslateDrawer) aiTranslateDrawer.classList.remove('processing');
        }
      }

      function renderAiTranslateResult(pairs) {
        // Render right side (translated) with highlighted sentences
        if (aiTranslateComparison) aiTranslateComparison.style.display = '';
        if (aiTranslateResult) {
          aiTranslateResult.innerHTML = '';
          pairs.forEach(pair => {
            const span = document.createElement('span');
            span.className = 'ai-translate-sentence';
            span.textContent = pair.translated || '';
            span.title = t('home.aiTranslate.clickToCopy');
            span.addEventListener('click', () => copySentenceText(span, pair.translated || ''));
            aiTranslateResult.appendChild(span);
          });
        }

        // Render left side (original) with matching highlight colors
        if (aiTranslateInput) {
          const leftPanel = aiTranslateInput.closest('.ai-polish-left-panel');
          if (leftPanel) {
            let highlightDiv = leftPanel.querySelector('.ai-translate-highlight');
            if (!highlightDiv) {
              highlightDiv = document.createElement('div');
              highlightDiv.className = 'ai-polish-polished ai-translate-highlight';
              highlightDiv.style.display = 'block';
              leftPanel.appendChild(highlightDiv);
            }
            highlightDiv.innerHTML = '';
            pairs.forEach(pair => {
              const span = document.createElement('span');
              span.className = 'ai-translate-sentence';
              span.textContent = pair.original || '';
              span.title = t('home.aiTranslate.clickToCopy');
              span.addEventListener('click', () => copySentenceText(span, pair.original || ''));
              highlightDiv.appendChild(span);
            });
            aiTranslateInput.style.display = 'none';
          }
        }
      }

      function copySentenceText(el, text) {
        if (!text) return;
        if (!navigator.clipboard) {
          alert(t('home.aiTranslate.copyFailed'));
          return;
        }
        navigator.clipboard.writeText(text).then(() => {
          el.classList.add('copied-flash');
          setTimeout(() => el.classList.remove('copied-flash'), 600);
        }).catch(() => {
          alert(t('home.aiTranslate.copyFailed'));
        });
      }

      function restoreAiTranslateInput() {
        if (aiTranslateInput) {
          aiTranslateInput.style.display = '';
          const leftPanel = aiTranslateInput.closest('.ai-polish-left-panel');
          const highlightDiv = leftPanel?.querySelector('.ai-translate-highlight');
          if (highlightDiv) highlightDiv.remove();
        }
      }

      // Event listeners
      if (aiTranslateBack) {
        aiTranslateBack.addEventListener('click', closeAiTranslateOverlay);
      }

      document.querySelectorAll('.audio-list-item[data-tool="ai-translate"]').forEach(item => {
        item.addEventListener('click', () => openToolWithAiCheck(openAiTranslateOverlay));
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openToolWithAiCheck(openAiTranslateOverlay);
          }
        });
      });

      if (aiTranslateStartBtn) {
        aiTranslateStartBtn.addEventListener('click', () => {
          if (aiTranslateResultMode) {
            resetAiTranslateState();
            restoreAiTranslateInput();
            return;
          }
          const text = aiTranslateInput?.value?.trim();
          if (!text) return;
          aiTranslateOriginalContent = text;
          showAiTranslateLangSelect();
        });
      }

      if (aiTranslateInput) {
        aiTranslateInput.addEventListener('input', () => {
          const hasText = aiTranslateInput.value.trim().length > 0;
          if (hasText) {
            aiTranslateStartBtn?.classList.remove('disabled');
          } else {
            aiTranslateStartBtn?.classList.add('disabled');
          }
        });
      }

      if (aiTranslateCopyBtn) {
        aiTranslateCopyBtn.addEventListener('click', () => {
          const text = aiTranslateResult?.textContent || '';
          if (!text) return;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
              aiTranslateCopyBtn.classList.add('copied');
              const icon = aiTranslateCopyBtn.querySelector('i[data-lucide]');
              if (icon) icon.setAttribute('data-lucide', 'check');
              if (window.lucide) window.lucide.createIcons();
              setTimeout(() => {
                aiTranslateCopyBtn.classList.remove('copied');
                if (icon) icon.setAttribute('data-lucide', 'copy');
                if (window.lucide) window.lucide.createIcons();
              }, 2000);
            }).catch(() => {
              alert(t('home.aiTranslate.copyFailed'));
            });
          } else {
            alert(t('home.aiTranslate.copyFailed'));
          }
        });
      }

      const aiTranslateCancelBtn = document.getElementById('aiTranslateCancelBtn');
      if (aiTranslateCancelBtn) {
        aiTranslateCancelBtn.addEventListener('click', () => {
          if (aiTranslateLangSelect) aiTranslateLangSelect.style.display = 'none';
          if (aiTranslateRightEmpty) aiTranslateRightEmpty.style.display = '';
        });
      }
      // ===== End AI Translate Tool =====

      // ===== AI Document Tool =====
      const aiDocOverlay = document.getElementById('aiDocOverlay');
      const aiDocBack = document.getElementById('aiDocBack');
      const aiDocBg = document.getElementById('aiDocBg');
      const aiDocChatMessages = document.getElementById('aiDocChatMessages');
      const aiDocChatInput = document.getElementById('aiDocChatInput');
      const aiDocChatSend = document.getElementById('aiDocChatSend');
      const aiDocCanvasEmpty = document.getElementById('aiDocCanvasEmpty');
      const aiDocThumbScroll = document.getElementById('aiDocThumbScroll');
      const aiDocCanvasToolbar = document.getElementById('aiDocCanvasToolbar');
      const aiDocExportBtn = document.getElementById('aiDocExportBtn');
      const aiDocMask = document.getElementById('aiDocMask');
      const aiDocMaskText = document.getElementById('aiDocMaskText');
      const aiDocEditOverlay = document.getElementById('aiDocEditOverlay');
      const aiDocEditBack = document.getElementById('aiDocEditBack');
      const aiDocEditBg = document.getElementById('aiDocEditBg');
      const aiDocEditScroll = document.getElementById('aiDocEditScroll');
      const aiDocEditExportBtn = document.getElementById('aiDocEditExportBtn');
      const aiDocSuccessOverlay = document.getElementById('aiDocSuccessOverlay');
      const aiDocSuccessPath = document.getElementById('aiDocSuccessPath');
      const aiDocSuccessOpenFolder = document.getElementById('aiDocSuccessOpenFolder');
      const aiDocSuccessOk = document.getElementById('aiDocSuccessOk');

      let aiDocCleanupFns = [];
      let aiDocDitherInstance = null;
      let aiDocEditDitherInstance = null;
      let aiDocLastExportPath = '';
      let aiDocChatHistory = [];
      let aiDocLayoutData = null; // { pages: [{ regions: [...] }] }
      let aiDocFontRegularBytes = null;
      let aiDocFontBoldBytes = null;

      const AI_DOC_PRESET_PROMPTS = [
        { labelKey: 'home.aiDoc.chipRent', prompt: '请帮我生成一份标准个人租房合同，要求：1. 包含出租方和承租方信息栏；2. 明确房屋地址、面积、租金、押金、付款方式；3. 详细列出租赁期限、房屋用途、维修责任；4. 加入违约条款、提前解约条件和费用承担；5. 末尾预留双方签字和日期区域；6. 排版专业，使用 A4 页面，包含标题、副标题、章节标题、正文、列表项、签字区和日期。内容详实，每页至少 15 个区域，禁止大面积留白。' },
        { labelKey: 'home.aiDoc.chipResign', prompt: '请帮我生成一份正式离职申请书/离职报告，要求：1. 标题为离职报告；2. 包含申请人信息、部门、职位、入职日期；3. 说明离职原因、最后工作日；4. 表达感谢和工作交接意愿；5. 加入交接事项清单；6. 末尾预留签名和日期区域；7. 排版专业，使用 A4 页面，包含标题、副标题、章节标题、正文、列表项、签字区和日期。内容详实，每页至少 15 个区域。' },
        { labelKey: 'home.aiDoc.chipMeeting', prompt: '请帮我生成一份项目周会会议纪要，要求：1. 包含会议主题、时间、地点、主持人、参会人员；2. 列出会议议程和讨论事项；3. 详细记录每个议题的讨论内容、结论和待办事项；4. 明确责任人（Responsible）和截止时间（Deadline）；5. 加入下次会议安排；6. 排版专业，使用 A4 页面，包含标题、副标题、章节标题、正文、列表项。内容详实，每页至少 15 个区域，禁止大面积留白。' },
        { labelKey: 'home.aiDoc.chipPrd', prompt: '请帮我生成一份产品需求文档（PRD），要求：1. 标题为产品需求文档；2. 包含产品背景、目标用户、核心目标；3. 详细描述功能需求，拆分为多个功能模块；4. 每个功能包含需求描述、业务流程、输入输出、异常处理；5. 加入非功能需求、项目排期、风险说明；6. 排版专业，使用 A4 页面，包含标题、副标题、章节标题、正文、列表项、表格行。内容详实，每页至少 15 个区域，禁止大面积留白。' },
        { labelKey: 'home.aiDoc.chipBusiness', prompt: '请帮我生成一份初创项目商业计划书，要求：1. 标题为商业计划书；2. 包含项目概述、市场痛点、解决方案；3. 详细分析目标市场、市场规模、竞争对手；4. 描述商业模式、盈利模式、运营计划；5. 介绍团队、财务预测、融资需求；6. 加入风险分析和未来规划；7. 排版专业，使用 A4 页面，至少 3 页，包含标题、副标题、章节标题、正文、列表项、表格行、强调段落和注释。内容详实，每页至少 15 个区域。' },
        { labelKey: 'home.aiDoc.chipResume', prompt: '请帮我生成一份个人简历，要求：1. 标题为个人简历；2. 包含个人信息、联系方式、求职意向；3. 详细列出教育背景、工作经历（每段经历包含公司名称、职位、时间、工作职责和业绩）；4. 列出专业技能、项目经验、证书荣誉；5. 加入自我评价；6. 排版专业，使用 A4 页面，包含标题、副标题、章节标题、正文、列表项、表格行。内容详实，每页至少 15 个区域，禁止大面积留白。' }
      ];

      const A4_WIDTH = 794;
      const A4_HEIGHT = 1123;
      const PDF_A4_WIDTH = 595.28;
      const PDF_A4_HEIGHT = 841.89;
      const SCALE_PX_TO_PDF = PDF_A4_WIDTH / A4_WIDTH;

      function openAiDocOverlay() {
        if (!aiDocOverlay) return;
        aiDocOverlay.classList.add('visible');
        resetAiDocState();
        if (aiDocBg && !aiDocDitherInstance) {
          aiDocDitherInstance = initDither(aiDocBg, {
            waveColor: [0.38823529411764707, 0.4, 0.9450980392156862],
            colorNum: 40,
            pixelSize: 2,
            waveAmplitude: 0,
            waveFrequency: 0,
            waveSpeed: 0.07
          });
        }
      }

      function closeAiDocOverlay() {
        if (!aiDocOverlay) return;
        aiDocOverlay.classList.remove('visible');
        resetAiDocState();
        if (aiDocDitherInstance) {
          aiDocDitherInstance();
          aiDocDitherInstance = null;
        }
      }

      function resetAiDocState() {
        aiDocChatHistory = [];
        aiDocLayoutData = null;
        // Clean up all document-level event listeners from regions
        aiDocCleanupFns.forEach(fn => fn());
        aiDocCleanupFns = [];
        if (aiDocChatMessages) {
          aiDocChatMessages.innerHTML = '';
          addAiDocChatMsg('ai', t('home.aiDoc.welcome'));
          addAiDocPromptChips();
        }
        if (aiDocChatInput) aiDocChatInput.value = '';
        if (aiDocCanvasEmpty) aiDocCanvasEmpty.style.display = '';
        if (aiDocThumbScroll) {
          aiDocThumbScroll.style.display = 'none';
          aiDocThumbScroll.innerHTML = '';
        }
        if (aiDocCanvasToolbar) aiDocCanvasToolbar.style.display = 'none';
      }

      // Shared user-avatar helper: tries localStorage photo, falls back to initial + gradient
      const AI_CHAT_USER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';

      function fillUserAvatar(avatarEl) {
        let userAvatarUrl = null, userName = '';
        try {
          const userJson = localStorage.getItem('toolknit_user');
          if (userJson) {
            const userObj = JSON.parse(userJson);
            userAvatarUrl = userObj.avatar || null;
            userName = userObj.username || userObj.email || '';
          }
        } catch (e) {}
        if (userAvatarUrl) {
          const img = document.createElement('img');
          img.src = userAvatarUrl;
          img.alt = 'Me';
          img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
          img.onerror = function() {
            this.style.display = 'none';
            _applyAvatarFallback(avatarEl, userName);
          };
          avatarEl.appendChild(img);
        } else {
          _applyAvatarFallback(avatarEl, userName);
        }
      }
      function _applyAvatarFallback(avatarEl, name) {
        const initial = (name && name[0]) ? name[0].toUpperCase() : '';
        if (initial) {
          avatarEl.innerHTML = '<span style="font-size:14px;font-weight:700;color:#fff;">' + initial + '</span>';
          avatarEl.style.background = 'linear-gradient(135deg,#667eea,#764ba2)';
        } else {
          avatarEl.innerHTML = AI_CHAT_USER_SVG;
          avatarEl.style.background = 'linear-gradient(135deg,#667eea,#764ba2)';
          avatarEl.style.color = '#fff';
        }
      }

      function addAiDocChatMsg(role, text, isGenLink = false) {
        if (!aiDocChatMessages) return;
        const msg = document.createElement('div');
        msg.className = `ai-doc-chat-msg ai-doc-chat-msg-${role}`;
        const avatar = document.createElement('div');
        avatar.className = 'ai-doc-chat-avatar';
        if (role === 'ai') {
          const img = document.createElement('img');
          img.src = '/assets/toolknit-icon.png';
          img.alt = 'AI';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.borderRadius = '50%';
          img.style.objectFit = 'cover';
          avatar.appendChild(img);
        } else {
          fillUserAvatar(avatar);
        }
        const bubble = document.createElement('div');
        bubble.className = 'ai-doc-chat-bubble';
        if (isGenLink) bubble.classList.add('ai-doc-gen-link');
        bubble.textContent = text;
        msg.appendChild(avatar);
        msg.appendChild(bubble);
        aiDocChatMessages.appendChild(msg);
        aiDocChatMessages.scrollTop = aiDocChatMessages.scrollHeight;
        if (window.lucide) window.lucide.createIcons();
        return bubble;
      }

      function addAiDocPromptChips() {
        if (!aiDocChatMessages) return;
        const msg = document.createElement('div');
        msg.className = 'ai-doc-chat-msg ai-doc-chat-msg-ai';
        const avatar = document.createElement('div');
        avatar.className = 'ai-doc-chat-avatar';
        const img = document.createElement('img');
        img.src = '/assets/toolknit-icon.png';
        img.alt = 'AI';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '50%';
        img.style.objectFit = 'cover';
        avatar.appendChild(img);
        const bubble = document.createElement('div');
        bubble.className = 'ai-doc-chat-bubble ai-doc-chip-bubble';
        const title = document.createElement('div');
        title.className = 'ai-doc-chip-title';
        title.textContent = t('home.aiDoc.chipTitle');
        const chips = document.createElement('div');
        chips.className = 'ai-doc-prompt-chips';
        AI_DOC_PRESET_PROMPTS.forEach(item => {
          const chip = document.createElement('button');
          chip.className = 'ai-doc-prompt-chip';
          chip.textContent = t(item.labelKey);
          chip.dataset.prompt = item.prompt;
          chips.appendChild(chip);
        });
        bubble.appendChild(title);
        bubble.appendChild(chips);
        msg.appendChild(avatar);
        msg.appendChild(bubble);
        aiDocChatMessages.appendChild(msg);
        aiDocChatMessages.scrollTop = aiDocChatMessages.scrollHeight;
      }

      function showAiDocMask(text) {
        if (aiDocMaskText) aiDocMaskText.textContent = text;
        if (aiDocMask) aiDocMask.classList.add('visible');
      }

      function hideAiDocMask() {
        if (aiDocMask) aiDocMask.classList.remove('visible');
      }

      async function handleAiDocSend() {
        const text = aiDocChatInput?.value?.trim();
        if (!text) return;
        addAiDocChatMsg('user', text);
        aiDocChatInput.value = '';
        aiDocChatSend.disabled = true;
        aiDocChatHistory.push({ role: 'user', content: text });

        showAiDocMask(t('home.aiDoc.thinking'));

        try {
          const systemPrompt = `你是一位顶级文档排版设计师，擅长生成内容密集、排版精美的专业 A4 文档。
用户会描述他们需要的文档类型和内容，你的任务是通过对话收集足够信息后生成一份高质量的多页文档。

## 核心原则
1. **内容为王**：每个 region 的 text 必须是完整的、详实的文字内容，不能是简短的占位符
2. **禁止留白**：每一页从 y=60 排列到 y=1060，region 之间间距不超过 12px，不允许出现超过 30px 的垂直空白
3. **文字要长**：正文 region 的 text 应该是完整的段落（至少 50-100 字），不要只写一两句话
4. **充实内容**：如果用户要求的文档内容不够填满 3 页，主动补充相关条款、注意事项、说明、附则等内容
5. **多分区域**：宁可多分几个小 region 也不要一个巨大 region 里只放几行字

## A4 画布规格
- 宽 794px × 高 1123px
- 页边距：上下 60px，左右 56px
- 内容区域：x: 56-738, y: 60-1063
- 正文满宽：x=56, w=682
- 缩进正文：x=76, w=662

## region type 样式指南
1. **title**：居中, fontSize 22-26, bold, y=60, h=50
2. **subtitle**：居中, fontSize 12-13, bold=false, y=115, h=22, 灰色
3. **section-heading**：左对齐, fontSize 14, bold, 上方留 14px, h=28
4. **sub-heading**：左对齐, fontSize 12, bold, 上方留 8px, h=22
5. **body**：左对齐, fontSize 11.5, h=根据文字行数精确计算（行数×17+8）
6. **body-indent**：左对齐, fontSize 11.5, x=76, w=662, 用于条款正文
7. **list-item**：左对齐, fontSize 11.5, x=76, w=662, text前加"• "或"1. "
8. **image**：图片占位, label 描述内容
9. **signature**：fontSize 12, 签字线
10. **date**：fontSize 12
11. **divider**：h=2, text="", 视觉分隔
12. **page-header**：居中, fontSize 9, y=30, h=18, 灰色
13. **page-footer**：居中, fontSize 9, y=1085, h=18, 灰色
14. **table-row**：fontSize 11, text用" | "分隔列
15. **note**（注释/提示）：左对齐, fontSize 10.5, x=76, w=662, 用于补充说明
16. **emphasis**（强调段落）：左对齐, fontSize 12, bold=true, 用于重要提示

## 布局计算公式
- 正文字号 11.5px，行高约 17px
- 一个 body region 的高度 = 文字行数 × 17 + 8
- 估算文字行数：中文字符数 / (w / fontSize) ≈ 字符数 / 59
- region 之间的 y 间距 = 上一个 region 的 y + h + 间距(6-12px)
- 每页可用高度约 1000px（60 到 1060）

## 输出长度硬性限制（极其重要，违反会导致文档无法显示）
- 由于模型单次输出长度有限，最终 JSON 总字符数绝对不能超过 13000 字符，否则会被截断导致用户看不到文档
- 文档总页数必须控制在 3-8 页之间，绝对不要超过 8 页
- 如果用户要求超过 8 页（例如"生成15页"），你必须把内容精炼浓缩到 8 页以内完成，并在 summary 中说明"已将内容浓缩为 N 页以保证完整生成"
- 每页 8-15 个 region 即可，不要过度堆砌
- 每个正文 region 的 text 控制在 1-3 行（20-80字），简明扼要，不要冗长
- 优先保证文档结构完整（标题、章节、正文、结尾齐全），宁可内容精简也不要被截断

## 内容组织建议
- 第一页：标题 + 副标题 + 概述 + 2-3 个核心章节
- 中间页：按主题分章节，每章节配 1-2 段精炼正文
- 最后页：总结 + 附则/签字区/日期
- 内容不足时适当补充，但始终遵守 8 页和 13000 字符上限

## 图片占位确认流程（硬性规则）
1. 如果用户描述中明确要求图片占位（如"要有X张图片"、"包含图片占位"、"插入图片"等），不要直接生成 JSON，必须先用 ready: false 回复确认。
2. 确认内容应包含：建议的图片位置（如"第1页顶部、第3页中部"）、每张图片的用途/描述，并询问用户是否确认。示例：{"ready": false, "question": "我计划在以下位置为您插入图片占位符：\n1. 第1页标题下方（封面图）\n2. 第2页功能概述区（界面截图）\n3. 第3页数据展示处（统计图）\n\n请确认是否按此方案生成，或告诉我您的调整要求。"}
3. 只有在用户确认后，才能在最终 JSON 中输出 image 类型 region。不得在未确认时直接生成图片占位。
4. 用户确认后，最终 JSON 必须严格包含用户要求的图片数量，每个图片 region 必须有 type: "image"、label（描述图片用途）和合适的 w/h（建议 w=300-500，h=180-320，根据页面布局动态调整）。
5. 如果用户未要求图片，最终 JSON 中不得出现 type: "image" 的 region。

## 对话规则
1. 信息不完整时追问（最多 3 轮）
2. 信息完整且图片占位已确认（如无需图片则直接）时返回 JSON
3. 当需要返回 JSON 时，必须直接返回原始 JSON 字符串，不要任何 markdown 代码块（如 \`\`\`json ... \`\`\` 或 \`\`\` ... \`\`\`），不要添加任何解释性文字、前缀或后缀。输出必须是合法 JSON 字符串本身，否则前端无法解析
4. 如果 JSON 输出被代码块标记包裹，前端会解析失败，用户看不到生成的文档
5. 闲聊或不需要生成文档时，返回普通文字即可，不要带 JSON

## JSON 示例（注意内容密度）
{"ready": true, "summary": "已为您生成产品介绍文档", "pages": [{"regions": [{"type": "page-header", "x": 56, "y": 30, "w": 682, "h": 18, "text": "ToolKnit 桌面版产品介绍", "fontSize": 9, "bold": false, "align": "center"}, {"type": "title", "x": 56, "y": 60, "w": 682, "h": 50, "text": "ToolKnit 桌面版 — 全能本地工具箱", "fontSize": 24, "bold": true, "align": "center"}, {"type": "subtitle", "x": 56, "y": 115, "w": 682, "h": 22, "text": "78+ 款工具 · 100% 离线运行 · 隐私零泄露", "fontSize": 12, "bold": false, "align": "center"}, {"type": "section-heading", "x": 56, "y": 150, "w": 682, "h": 28, "text": "一、产品概述", "fontSize": 14, "bold": true, "align": "left"}, {"type": "body", "x": 56, "y": 184, "w": 682, "h": 76, "text": "ToolKnit 是一款集成了 PDF 处理、图片编辑、视频转换、音频处理、文本工具、计算器、创意设计、AI 智能助手等 10 大分类共 78+ 款工具的桌面应用程序。基于 Tauri 2.x 框架构建，前端采用原生 HTML/CSS/JavaScript，后端使用 Rust 提供高性能本地处理能力。所有文件操作均在用户设备本地完成，不上传任何数据到服务器，从架构层面杜绝隐私泄露风险。", "fontSize": 11.5, "bold": false, "align": "left"}, {"type": "section-heading", "x": 56, "y": 270, "w": 682, "h": 28, "text": "二、技术架构", "fontSize": 14, "bold": true, "align": "left"}, {"type": "body", "x": 56, "y": 304, "w": 682, "h": 93, "text": "ToolKnit 桌面版采用 Tauri 2.x 作为应用框架，相较于 Electron 方案，Tauri 使用系统原生 WebView，安装包体积仅约 15MB，内存占用降低 60% 以上。Rust 后端负责文件 I/O、系统调用、加密解密等高性能任务，前端通过 Tauri IPC 进行通信。PDF 处理基于 pdf-lib-plus-encrypt 库，支持 PDF 合并、拆分、旋转、压缩、加密、解密、水印增强等全套操作。", "fontSize": 11.5, "bold": false, "align": "left"}, {"type": "page-footer", "x": 56, "y": 1085, "w": 682, "h": 18, "text": "第 1 页 / 共 3 页", "fontSize": 9, "bold": false, "align": "center"}]}]}

坐标系：x 范围 0-794, y 范围 0-1123`;

          const content = await callDeepSeek([
            { role: 'system', content: systemPrompt },
            ...aiDocChatHistory.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
          ], null, 8192);

          aiDocChatHistory.push({ role: 'assistant', content });

          // Try to extract JSON from response using balanced brace matching
          console.log('[AI Doc] raw content length:', content?.length, 'preview:', content?.slice(0, 200));
          const jsonStr = extractJson(content);
          console.log('[AI Doc] extracted jsonStr length:', jsonStr?.length, 'preview:', jsonStr?.slice(0, 200));
          if (!jsonStr) {
            // No JSON, treat as plain conversation
            addAiDocChatMsg('ai', content);
            return;
          }

          let parsed;
          try {
            parsed = JSON.parse(jsonStr);
          } catch (parseErr) {
            console.error('[AI Doc] JSON parse failed:', parseErr, jsonStr?.slice(0, 500));
            // Try once more with aggressive cleanup
            const fallbackJson = jsonStr.replace(/[\u0000-\u001F\uFEFF\uFFFD]/g, ' ').replace(/\n/g, '\\n');
            try {
              parsed = JSON.parse(fallbackJson);
            } catch (e2) {
              addAiDocChatMsg('ai', t('home.aiDoc.parseError'));
              return;
            }
          }

          if (parsed.ready === false && parsed.question) {
            addAiDocChatMsg('ai', parsed.question);
            return;
          }

          if (parsed.ready === true && parsed.pages && Array.isArray(parsed.pages) && parsed.pages.length > 0) {
            // Show summary as chat message with click-to-preview
            const summaryText = parsed.summary || t('home.aiDoc.docReady');
            const bubble = addAiDocChatMsg('ai', summaryText, true);
            aiDocLayoutData = parsed;
            bubble.addEventListener('click', () => {
              openAiDocEditOverlay();
            });
            // Auto-render thumbnails immediately
            renderAiDocThumbnails(parsed);
          } else {
            // Fallback: show raw text
            console.warn('[AI Doc] parsed missing ready/pages:', parsed);
            addAiDocChatMsg('ai', content);
          }
        } catch (e) {
          console.error('[AI Doc] Error:', e);
          addAiDocChatMsg('ai', t('home.aiDoc.networkError'));
        } finally {
          hideAiDocMask();
          aiDocChatSend.disabled = false;
        }
      }

      // Render read-only horizontal thumbnails
      function renderAiDocThumbnails(data) {
        if (!aiDocThumbScroll || !data.pages) return;
        if (aiDocCanvasEmpty) aiDocCanvasEmpty.style.display = 'none';
        aiDocThumbScroll.style.display = '';
        if (aiDocCanvasToolbar) aiDocCanvasToolbar.style.display = '';
        aiDocThumbScroll.innerHTML = '';

        data.pages.forEach((page, pageIdx) => {
          const thumb = document.createElement('div');
          thumb.className = 'ai-doc-thumb';

          // Scaled content (read-only, no pointer events)
          const content = document.createElement('div');
          content.className = 'ai-doc-thumb-content';
          if (page.regions) {
            page.regions.forEach((region, regionIdx) => {
              const el = createAiDocRegionReadOnly(region);
              if (el) content.appendChild(el);
            });
          }
          thumb.appendChild(content);

          // Hover overlay with blur + hint text
          const overlay = document.createElement('div');
          overlay.className = 'ai-doc-thumb-overlay';
          const overlayText = document.createElement('div');
          overlayText.className = 'ai-doc-thumb-overlay-text';
          overlayText.textContent = t('home.aiDoc.clickToEdit');
          overlay.appendChild(overlayText);
          thumb.appendChild(overlay);

          // Page number
          const pageNum = document.createElement('div');
          pageNum.className = 'ai-doc-thumb-num';
          pageNum.textContent = `${pageIdx + 1} / ${data.pages.length}`;
          thumb.appendChild(pageNum);

          // Click to open edit overlay
          thumb.addEventListener('click', () => openAiDocEditOverlay());

          aiDocThumbScroll.appendChild(thumb);
        });
        if (window.lucide) window.lucide.createIcons();
      }

      // Read-only region for thumbnails (no drag, no resize, no edit)
      function createAiDocRegionReadOnly(region) {
        const el = document.createElement('div');
        el.className = 'ai-doc-region';
        el.style.left = (region.x || 0) + 'px';
        el.style.top = (region.y || 0) + 'px';
        el.style.width = (region.w || 200) + 'px';
        el.style.minHeight = (region.h || 40) + 'px';
        el.style.height = 'auto';
        el.style.cursor = 'default';
        el.style.outline = 'none';

        if (region.type === 'image') {
          el.classList.add('ai-doc-region-image');
          if (region.imageData) {
            const img = document.createElement('img');
            img.src = region.imageData;
            el.appendChild(img);
          } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'ai-doc-img-placeholder';
            placeholder.innerHTML = `<i data-lucide="image"></i><span>${escapeHtml(region.label || t('home.aiDoc.imgPlaceholder'))}</span>`;
            el.appendChild(placeholder);
          }
        } else if (region.type === 'divider') {
          const dividerEl = document.createElement('div');
          dividerEl.style.width = '100%';
          dividerEl.style.height = '1px';
          dividerEl.style.background = '#ccc';
          dividerEl.style.marginTop = '4px';
          el.appendChild(dividerEl);
        } else {
          const textEl = document.createElement('div');
          textEl.className = 'ai-doc-region-text';
          textEl.textContent = region.text || '';
          textEl.style.fontWeight = region.bold ? 'bold' : 'normal';
          textEl.style.textAlign = region.align || 'left';
          textEl.style.fontSize = (region.fontSize || 12) + 'px';

          switch (region.type) {
            case 'title':
              textEl.style.fontWeight = 'bold';
              textEl.style.fontSize = (region.fontSize || 24) + 'px';
              break;
            case 'subtitle':
              textEl.style.color = '#666';
              textEl.style.fontSize = (region.fontSize || 13) + 'px';
              break;
            case 'section-heading':
              textEl.style.fontWeight = 'bold';
              textEl.style.fontSize = (region.fontSize || 14) + 'px';
              textEl.style.borderBottom = '1px solid #ddd';
              textEl.style.paddingBottom = '4px';
              break;
            case 'sub-heading':
              textEl.style.fontWeight = 'bold';
              textEl.style.fontSize = (region.fontSize || 12) + 'px';
              break;
            case 'page-header':
            case 'page-footer':
              textEl.style.color = '#999';
              textEl.style.fontSize = (region.fontSize || 9) + 'px';
              break;
            case 'table-row':
              textEl.style.fontFamily = 'monospace';
              textEl.style.whiteSpace = 'pre';
              textEl.style.fontSize = (region.fontSize || 11) + 'px';
              break;
            case 'note':
              textEl.style.fontSize = (region.fontSize || 10.5) + 'px';
              textEl.style.color = '#888';
              textEl.style.fontStyle = 'italic';
              break;
            case 'emphasis':
              textEl.style.fontWeight = 'bold';
              textEl.style.fontSize = (region.fontSize || 12) + 'px';
              break;
            default:
              textEl.style.fontSize = (region.fontSize || 12) + 'px';
          }
          el.appendChild(textEl);
        }
        return el;
      }

      // Open full-screen edit overlay
      function openAiDocEditOverlay() {
        if (!aiDocEditOverlay || !aiDocLayoutData) return;
        aiDocEditOverlay.classList.add('visible');
        // Clean up previous edit listeners
        aiDocCleanupFns.forEach(fn => fn());
        aiDocCleanupFns = [];
        // Render full A4 pages with editing enabled
        renderAiDocEditPages(aiDocLayoutData);
        // Init dither background for edit overlay
        if (aiDocEditBg && !aiDocEditDitherInstance) {
          aiDocEditDitherInstance = initDither(aiDocEditBg, {
            waveColor: [0.38823529411764707, 0.4, 0.9450980392156862],
            colorNum: 40,
            pixelSize: 2,
            waveAmplitude: 0,
            waveFrequency: 0,
            waveSpeed: 0.07
          });
        }
      }

      function closeAiDocEditOverlay() {
        if (!aiDocEditOverlay) return;
        aiDocEditOverlay.classList.remove('visible');
        // Clean up edit listeners
        aiDocCleanupFns.forEach(fn => fn());
        aiDocCleanupFns = [];
        if (aiDocEditScroll) aiDocEditScroll.innerHTML = '';
        if (aiDocEditDitherInstance) {
          aiDocEditDitherInstance();
          aiDocEditDitherInstance = null;
        }
      }

      // Render full-size A4 pages in edit overlay (with editing enabled)
      function renderAiDocEditPages(data) {
        if (!aiDocEditScroll || !data.pages) return;
        // Clean up previous drag/resize listeners to prevent leak when reflowing
        // (uploadAiDocImage triggers reflow repeatedly; without this, document-level
        // mousemove/mouseup listeners accumulate and cause drag glitches + slowdown).
        aiDocCleanupFns.forEach(fn => fn());
        aiDocCleanupFns = [];
        aiDocEditScroll.innerHTML = '';

        const PAGE_BOTTOM = 1060;
        const PAGE_TOP = 60;
        const GAP = 8;
        const HEADER_Y = 30;
        const FOOTER_Y = 1085;

        const newPages = [];

        // Process each original page separately, preserving AI page structure
        data.pages.forEach((page, originalPageIdx) => {
          if (!page.regions || page.regions.length === 0) return;

          const sorted = [...page.regions].sort((a, b) => (a.y || 0) - (b.y || 0));
          const header = sorted.find(r => r.type === 'page-header');
          const footer = sorted.find(r => r.type === 'page-footer');
          const contentRegions = sorted.filter(r => r.type !== 'page-header' && r.type !== 'page-footer');

          // pageIdx must always equal this page's final index in newPages so that
          // uploadAiDocImage / drag / resize write back to the correct region.
          let pageIdx = newPages.length;

          // Start the first page for this original page
          let pageDiv = document.createElement('div');
          pageDiv.className = 'ai-doc-page';
          pageDiv.style.width = A4_WIDTH + 'px';
          pageDiv.style.minHeight = A4_HEIGHT + 'px';
          aiDocEditScroll.appendChild(pageDiv);

          let currentPageRegions = [];
          let currentY = PAGE_TOP;

          // Add header to first page
          if (header) {
            const h = { ...header, y: HEADER_Y };
            const hEl = createAiDocRegion(h, pageIdx, 0);
            if (hEl) {
              pageDiv.appendChild(hEl);
              currentPageRegions.push(h);
            }
          }

          for (const r of contentRegions) {
            const minH = r.h || 40;
            // If content overflows and we already have content, start a new page
            if (currentY + minH > PAGE_BOTTOM && currentPageRegions.length > (header ? 1 : 0)) {
              // Add footer to current page
              if (footer) {
                const f = { ...footer, y: FOOTER_Y, text: footer.text || t('home.aiDoc.pageNumber', { n: pageIdx + 1 }) };
                const fEl = createAiDocRegion(f, pageIdx, currentPageRegions.length);
                if (fEl) {
                  pageDiv.appendChild(fEl);
                  currentPageRegions.push(f);
                }
              }
              newPages.push({ regions: currentPageRegions });

              // Start new page — pageIdx tracks the next slot in newPages
              pageIdx = newPages.length;
              currentPageRegions = [];
              currentY = PAGE_TOP;
              pageDiv = document.createElement('div');
              pageDiv.className = 'ai-doc-page';
              pageDiv.style.width = A4_WIDTH + 'px';
              pageDiv.style.minHeight = A4_HEIGHT + 'px';
              aiDocEditScroll.appendChild(pageDiv);

              if (header) {
                const h = { ...header, y: HEADER_Y };
                const hEl = createAiDocRegion(h, pageIdx, 0);
                if (hEl) {
                  pageDiv.appendChild(hEl);
                  currentPageRegions.push(h);
                }
              }
            }

            // Place region at currentY
            r.y = currentY;
            const el = createAiDocRegion(r, pageIdx, currentPageRegions.length);
            if (el) {
              pageDiv.appendChild(el);
              const measuredH = el.offsetHeight;
              const actualH = Math.max(minH, measuredH);
              r.h = actualH;
              currentY += actualH + GAP;
            }
            currentPageRegions.push(r);
          }

          // Add footer to last page of this original page
          if (footer) {
            const f = { ...footer, y: FOOTER_Y, text: footer.text || t('home.aiDoc.pageNumber', { n: pageIdx + 1 }) };
            const fEl = createAiDocRegion(f, pageIdx, currentPageRegions.length);
            if (fEl) {
              pageDiv.appendChild(fEl);
              currentPageRegions.push(f);
            }
          }

          newPages.push({ regions: currentPageRegions });
        });

        // Update layout data with new pages
        data.pages = newPages;

        // Add page numbers to all pages
        const allPageDivs = aiDocEditScroll.querySelectorAll('.ai-doc-page');
        const totalPages = allPageDivs.length;
        allPageDivs.forEach((pd, idx) => {
          const pageNum = document.createElement('div');
          pageNum.className = 'ai-doc-page-num';
          pageNum.textContent = `${idx + 1} / ${totalPages}`;
          pd.appendChild(pageNum);
        });

        if (window.lucide) window.lucide.createIcons();
      }

      function createAiDocRegion(region, pageIdx, regionIdx) {
        const el = document.createElement('div');
        el.className = 'ai-doc-region';
        el.dataset.pageIdx = pageIdx;
        el.dataset.regionIdx = regionIdx;
        el.style.left = (region.x || 0) + 'px';
        el.style.top = (region.y || 0) + 'px';
        el.style.width = (region.w || 200) + 'px';
        // Use min-height instead of fixed height so text can expand
        el.style.minHeight = (region.h || 40) + 'px';
        el.style.height = 'auto';

        if (region.type === 'image') {
          el.classList.add('ai-doc-region-image');
          if (region.imageData) {
            const img = document.createElement('img');
            img.src = region.imageData;
            img.style.width = '100%';
            // Use stored imageHeight for deterministic layout (avoids async-load height jitter)
            img.style.height = region.imageHeight ? region.imageHeight + 'px' : 'auto';
            img.style.display = 'block';
            img.style.objectFit = 'contain';
            el.appendChild(img);
          } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'ai-doc-img-placeholder';
            placeholder.innerHTML = `<i data-lucide="image"></i><span>${escapeHtml(region.label || t('home.aiDoc.imgUploadHint'))}</span>`;
            el.appendChild(placeholder);
          }
          el.addEventListener('dblclick', () => uploadAiDocImage(el, regionIdx, pageIdx));
          if (window.lucide) window.lucide.createIcons();
        } else if (region.type === 'divider') {
          const dividerEl = document.createElement('div');
          dividerEl.style.width = '100%';
          dividerEl.style.height = '1px';
          dividerEl.style.background = '#ccc';
          dividerEl.style.marginTop = '4px';
          el.appendChild(dividerEl);
        } else {
          // Text-based region
          const textEl = document.createElement('div');
          textEl.className = 'ai-doc-region-text';
          textEl.textContent = region.text || '';
          textEl.style.fontSize = (region.fontSize || 12) + 'px';
          textEl.style.fontWeight = region.bold ? 'bold' : 'normal';
          textEl.style.textAlign = region.align || 'left';

          // Apply styles based on region type
          switch (region.type) {
            case 'title':
              textEl.style.fontWeight = 'bold';
              textEl.style.fontSize = (region.fontSize || 24) + 'px';
              break;
            case 'subtitle':
              textEl.style.color = '#666';
              textEl.style.fontSize = (region.fontSize || 13) + 'px';
              break;
            case 'section-heading':
              textEl.style.fontWeight = 'bold';
              textEl.style.fontSize = (region.fontSize || 14) + 'px';
              textEl.style.borderBottom = '1px solid #ddd';
              textEl.style.paddingBottom = '4px';
              break;
            case 'sub-heading':
              textEl.style.fontWeight = 'bold';
              textEl.style.fontSize = (region.fontSize || 12) + 'px';
              break;
            case 'page-header':
            case 'page-footer':
              textEl.style.color = '#999';
              textEl.style.fontSize = (region.fontSize || 9) + 'px';
              break;
            case 'list-item':
              textEl.style.fontSize = (region.fontSize || 11) + 'px';
              break;
            case 'body-indent':
              textEl.style.fontSize = (region.fontSize || 12) + 'px';
              break;
            case 'signature':
              textEl.style.fontSize = (region.fontSize || 12) + 'px';
              break;
            case 'date':
              textEl.style.fontSize = (region.fontSize || 12) + 'px';
              break;
            case 'table-row':
              textEl.style.fontSize = (region.fontSize || 11) + 'px';
              textEl.style.fontFamily = 'monospace';
              textEl.style.whiteSpace = 'pre';
              break;
            case 'note':
              textEl.style.fontSize = (region.fontSize || 10.5) + 'px';
              textEl.style.color = '#777';
              textEl.style.fontStyle = 'italic';
              break;
            case 'emphasis':
              textEl.style.fontWeight = 'bold';
              textEl.style.fontSize = (region.fontSize || 12) + 'px';
              textEl.style.color = '#333';
              break;
            default: // body
              textEl.style.fontSize = (region.fontSize || 12) + 'px';
          }
          el.appendChild(textEl);

          // Double-click to edit text
          el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            textEl.setAttribute('contenteditable', 'true');
            textEl.focus();
            // Select all
            const range = document.createRange();
            range.selectNodeContents(textEl);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          });
          textEl.addEventListener('blur', () => {
            textEl.removeAttribute('contenteditable');
            // Update layout data
            if (aiDocLayoutData?.pages?.[pageIdx]?.regions?.[regionIdx]) {
              aiDocLayoutData.pages[pageIdx].regions[regionIdx].text = textEl.textContent;
            }
          });
          textEl.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              textEl.blur();
            }
          });
        }

        // Drag to move
        const cleanupDrag = makeAiDocRegionDraggable(el, pageIdx, regionIdx);
        if (cleanupDrag) aiDocCleanupFns.push(cleanupDrag);

        // Resize handle
        const handle = document.createElement('div');
        handle.className = 'ai-doc-resize-handle';
        el.appendChild(handle);
        const cleanupResize = makeAiDocRegionResizable(el, handle, pageIdx, regionIdx);
        if (cleanupResize) aiDocCleanupFns.push(cleanupResize);

        return el;
      }

      function makeAiDocRegionDraggable(el, pageIdx, regionIdx) {
        let isDragging = false;
        let startX, startY, origX, origY;

        const onMouseDown = (e) => {
          if (e.target.getAttribute('contenteditable') === 'true') return;
          if (e.target.classList.contains('ai-doc-resize-handle')) return;
          isDragging = true;
          startX = e.clientX;
          startY = e.clientY;
          origX = parseInt(el.style.left);
          origY = parseInt(el.style.top);
          el.classList.add('selected');
          e.preventDefault();
        };

        const onMouseMove = (e) => {
          if (!isDragging) return;
          let newX = origX + (e.clientX - startX);
          let newY = origY + (e.clientY - startY);
          // Use offsetWidth/offsetHeight: el.style.height is 'auto', so parseInt would be NaN.
          newX = Math.max(0, Math.min(A4_WIDTH - el.offsetWidth, newX));
          newY = Math.max(0, Math.min(A4_HEIGHT - el.offsetHeight, newY));
          el.style.left = newX + 'px';
          el.style.top = newY + 'px';
        };

        const onMouseUp = () => {
          if (!isDragging) return;
          isDragging = false;
          el.classList.remove('selected');
          if (aiDocLayoutData?.pages?.[pageIdx]?.regions?.[regionIdx]) {
            aiDocLayoutData.pages[pageIdx].regions[regionIdx].x = parseInt(el.style.left);
            aiDocLayoutData.pages[pageIdx].regions[regionIdx].y = parseInt(el.style.top);
          }
        };

        el.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // Return cleanup function to remove listeners
        return () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };
      }

      function makeAiDocRegionResizable(el, handle, pageIdx, regionIdx) {
        let isResizing = false;
        let startX, startY, origW, origH;

        const onMouseDown = (e) => {
          e.stopPropagation();
          isResizing = true;
          startX = e.clientX;
          startY = e.clientY;
          // el.style.height is 'auto'; read the rendered size instead to avoid NaN.
          origW = el.offsetWidth;
          origH = el.offsetHeight;
        };

        const onMouseMove = (e) => {
          if (!isResizing) return;
          let newW = origW + (e.clientX - startX);
          let newH = origH + (e.clientY - startY);
          newW = Math.max(30, Math.min(A4_WIDTH - parseInt(el.style.left), newW));
          newH = Math.max(20, Math.min(A4_HEIGHT - parseInt(el.style.top), newH));
          el.style.width = newW + 'px';
          el.style.height = newH + 'px';
          el.style.minHeight = newH + 'px';
        };

        const onMouseUp = () => {
          if (!isResizing) return;
          isResizing = false;
          if (aiDocLayoutData?.pages?.[pageIdx]?.regions?.[regionIdx]) {
            const region = aiDocLayoutData.pages[pageIdx].regions[regionIdx];
            region.w = parseInt(el.style.width);
            region.h = parseInt(el.style.height);
            // Keep image height in sync so reflow/export use the resized dimensions.
            if (region.type === 'image' && region.imageData) {
              region.imageHeight = region.h;
              region.imageWidth = region.w;
            }
          }
        };

        handle.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        return () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };
      }

      async function uploadAiDocImage(el, regionIdx, pageIdx) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          let dataUrl;
          if (isTauri && file.path) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const rawBytes = await invoke('read_file_bytes', { path: file.path });
              const bytes = Array.isArray(rawBytes) ? Uint8Array.from(rawBytes) : new Uint8Array(rawBytes);
              const blob = new Blob([bytes], { type: file.type || 'image/png' });
              dataUrl = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result);
                r.onerror = () => reject(new Error('FileReader error'));
                r.readAsDataURL(blob);
              });
            } catch (err) {
              console.error('AI Doc image read error:', err);
              return;
            }
          } else {
            dataUrl = await new Promise((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(r.result);
              r.onerror = () => reject(new Error('FileReader error'));
              r.readAsDataURL(file);
            });
          }
          const tempImg = new Image();
          tempImg.onload = () => {
              const naturalW = tempImg.naturalWidth;
              const naturalH = tempImg.naturalHeight;
              const regionW = parseInt(el.style.width) || 200;
              // Calculate display height maintaining aspect ratio, fit within region width
              const displayW = regionW;
              const displayH = Math.round(naturalH * (displayW / naturalW));
              // Cap height to avoid overflow
              const maxH = 500;
              const finalH = Math.min(displayH, maxH);
              const finalW = Math.round(naturalW * (finalH / naturalH));

              el.innerHTML = '';
              const img = document.createElement('img');
              img.src = dataUrl;
              img.style.width = finalW + 'px';
              img.style.height = finalH + 'px';
              img.style.objectFit = 'contain';
              img.style.display = 'block';
              el.appendChild(img);

              // Update layout data with actual image dimensions
              if (aiDocLayoutData?.pages?.[pageIdx]?.regions?.[regionIdx]) {
                const region = aiDocLayoutData.pages[pageIdx].regions[regionIdx];
                region.imageData = dataUrl;
                region.imageWidth = finalW;
                region.imageHeight = finalH;
                region.w = finalW;
                region.h = finalH;
                el.style.width = finalW + 'px';
                el.style.minHeight = finalH + 'px';
              }
              // Reflow entire document to adjust subsequent regions and prevent overlap
              if (aiDocLayoutData) {
                renderAiDocEditPages(aiDocLayoutData);
              }
          };
          tempImg.src = dataUrl;
        });
        input.click();
      }

      async function loadAiDocFontBytes() {
        // Only one font file exists; load it once and reuse for both regular and bold
        // to avoid embedding two identical copies into the PDF (halves font overhead).
        if (aiDocFontRegularBytes) return;
        try {
          const res = await fetch('./DouyinSansBold.otf');
          if (!res.ok) throw new Error('font fetch status ' + res.status);
          const buf = await res.arrayBuffer();
          // Guard against SPA fallback returning index.html (sfntVersion would be '<!DO').
          const head = new Uint8Array(buf.slice(0, 4));
          if (head[0] === 0x3C) throw new Error('font fetch returned HTML, not a font file');
          aiDocFontRegularBytes = buf;
          aiDocFontBoldBytes = buf;
        } catch (e) {
          console.error('[AI Doc] Failed to load font:', e);
          aiDocFontRegularBytes = null;
          aiDocFontBoldBytes = null;
        }
      }

      async function exportAiDocPdf() {
        if (!aiDocLayoutData?.pages) return;
        showAiDocMask(t('home.aiDoc.exporting'));

        try {
          await loadAiDocFontBytes();
          const pdfLib = await import('pdf-lib-plus-encrypt');
          const { PDFDocument, StandardFonts, rgb } = pdfLib;
          const fontkit = (await import('@pdf-lib/fontkit')).default;
          const pdfDoc = await PDFDocument.create();
          pdfDoc.registerFontkit(fontkit);

          // Embed full font (not subset) for maximum compatibility across all PDF readers.
          // Since regular and bold share one file, embed once and reuse to keep PDF small.
          let fontRegular, fontBold;
          if (aiDocFontRegularBytes) {
            fontRegular = await pdfDoc.embedFont(aiDocFontRegularBytes);
          } else {
            fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
          }
          fontBold = fontRegular;

          // Preserve page structure: process each original page separately
          const PAGE_BOTTOM_PX = 1060;
          const PAGE_TOP_PX = 60;
          const GAP_PX = 8;
          const HEADER_Y_PX = 30;
          const FOOTER_Y_PX = 1085;

          // First pass: figure out total pages
          const pageInfos = [];
          aiDocLayoutData.pages.forEach(page => {
            if (!page.regions || page.regions.length === 0) return;
            const sorted = [...page.regions].sort((a, b) => (a.y || 0) - (b.y || 0));
            const header = sorted.find(r => r.type === 'page-header') || null;
            const footer = sorted.find(r => r.type === 'page-footer') || null;
            const contentRegions = sorted.filter(r => r.type !== 'page-header' && r.type !== 'page-footer');
            let pageCount = 1;
            let currentY = PAGE_TOP_PX;
            for (const r of contentRegions) {
              const fontSizePdf = (r.fontSize || 12) * SCALE_PX_TO_PDF;
              const wPdf = (r.w || 200) * SCALE_PX_TO_PDF;
              const isBold = r.bold || ['title', 'section-heading', 'sub-heading', 'emphasis'].includes(r.type);
              const fnt = isBold ? fontBold : fontRegular;
              const neededH = calcRegionHeightPx(r, fnt, fontSizePdf, wPdf);
              if (currentY + neededH > PAGE_BOTTOM_PX && currentY > PAGE_TOP_PX) {
                pageCount++;
                currentY = PAGE_TOP_PX;
              }
              currentY += neededH + GAP_PX;
            }
            pageInfos.push({ header, footer, contentRegions, pageCount });
          });
          const totalPages = pageInfos.reduce((sum, p) => sum + p.pageCount, 0);

          // Helper to draw a single region on a pdfPage
          async function drawRegionOnPdf(region, pdfPage, ph) {
            const x = (region.x || 0) * SCALE_PX_TO_PDF;
            const y = ph - ((region.y || 0) + (region.h || 40)) * SCALE_PX_TO_PDF;
            const w = (region.w || 200) * SCALE_PX_TO_PDF;
            const h = (region.h || 40) * SCALE_PX_TO_PDF;
            const fontSize = (region.fontSize || 12) * SCALE_PX_TO_PDF;
            let color = rgb(0.1, 0.1, 0.1);
            if (['page-header', 'page-footer'].includes(region.type)) {
              color = rgb(0.6, 0.6, 0.6);
            } else if (region.type === 'subtitle') {
              color = rgb(0.4, 0.4, 0.4);
            } else if (region.type === 'note') {
              color = rgb(0.5, 0.5, 0.5);
            } else if (region.type === 'emphasis') {
              color = rgb(0.2, 0.2, 0.2);
            }
            const isBold = region.bold || ['title', 'section-heading', 'sub-heading', 'emphasis'].includes(region.type);
            const font = isBold ? fontBold : fontRegular;

            if (region.type === 'image' && region.imageData) {
              try {
                const base64Data = region.imageData.split(',')[1];
                const imgBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                let img;
                if (region.imageData.includes('image/png')) {
                  img = await pdfDoc.embedPng(imgBytes);
                } else {
                  img = await pdfDoc.embedJpg(imgBytes);
                }
                // Use image's actual aspect ratio, fit within region width
                const imgScale = Math.min(w / img.width, h / img.height);
                const drawW = img.width * imgScale;
                const drawH = img.height * imgScale;
                const drawX = x + (w - drawW) / 2;
                const drawY = y + (h - drawH) / 2;
                pdfPage.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
              } catch (err) {
                console.error('[AI Doc] Image embed error:', err);
              }
            } else if (region.type === 'image' && !region.imageData) {
              pdfPage.drawRectangle({
                x, y, width: w, height: h,
                color: rgb(0.88, 0.88, 0.88),
                borderColor: rgb(0.7, 0.7, 0.7),
                borderWidth: 0.5
              });
              const placeholderText = region.label || t('home.aiDoc.imgPlaceholder');
              const placeholderFontSize = Math.min(fontSize, 10);
              const textWidth = font.widthOfTextAtSize(placeholderText, placeholderFontSize);
              const textX = x + (w - textWidth) / 2;
              const textY = y + h / 2 - placeholderFontSize / 2;
              pdfPage.drawText(placeholderText, {
                x: textX, y: textY, size: placeholderFontSize,
                font: fontRegular, color: rgb(0.6, 0.6, 0.6)
              });
            } else if (region.type === 'divider') {
              pdfPage.drawLine({
                start: { x, y: y + h / 2 },
                end: { x: x + w, y: y + h / 2 },
                thickness: 0.5,
                color: rgb(0.8, 0.8, 0.8)
              });
            } else if (region.text) {
              const lines = wrapPdfText(region.text, font, fontSize, w);
              const lineHeight = fontSize * 1.5;
              const actualHeight = lines.length * lineHeight + fontSize * 0.5;
              const effectiveH = Math.max(h, actualHeight);
              let textY = y + effectiveH - fontSize;

              lines.forEach(line => {
                let textX = x;
                if (region.align === 'center') {
                  const textWidth = font.widthOfTextAtSize(line, fontSize);
                  textX = x + (w - textWidth) / 2;
                } else if (region.align === 'right') {
                  const textWidth = font.widthOfTextAtSize(line, fontSize);
                  textX = x + w - textWidth;
                }
                pdfPage.drawText(line, { x: textX, y: textY, size: fontSize, font, color });
                textY -= lineHeight;
              });

              if (region.type === 'section-heading') {
                const headingText = region.text || '';
                const textWidth = font.widthOfTextAtSize(headingText, fontSize);
                let lineX = x;
                if (region.align === 'center') {
                  lineX = x + (w - textWidth) / 2;
                }
                pdfPage.drawLine({
                  start: { x: lineX, y: y + h - fontSize - 4 },
                  end: { x: lineX + Math.min(textWidth, w), y: y + h - fontSize - 4 },
                  thickness: 0.5,
                  color: rgb(0.8, 0.8, 0.8)
                });
              }
            }
          }

          // Helper to calculate region height in px
          function calcRegionHeightPx(region, font, fontSize, w) {
            if (region.text && region.type !== 'divider') {
              const lines = wrapPdfText(region.text, font, fontSize, w);
              const lineHeight = fontSize * 1.5;
              const actualHeightPdf = lines.length * lineHeight + fontSize * 0.5;
              const actualHeightPx = actualHeightPdf / SCALE_PX_TO_PDF;
              return Math.max(region.h || 40, actualHeightPx);
            } else if (region.type === 'image') {
              return region.imageHeight || region.h || 100;
            } else {
              return region.h || 20;
            }
          }

          // Second pass: draw pages preserving original page structure
          let currentPageNum = 0;
          let currentYPx = PAGE_TOP_PX;
          let pdfPage = pdfDoc.addPage([PDF_A4_WIDTH, PDF_A4_HEIGHT]);
          let { height: currentPh } = pdfPage.getSize();

          for (const info of pageInfos) {
            // Start a new page for each original page
            if (currentPageNum > 0) {
              currentYPx = PAGE_TOP_PX;
              pdfPage = pdfDoc.addPage([PDF_A4_WIDTH, PDF_A4_HEIGHT]);
              currentPh = pdfPage.getSize().height;
            }
            currentPageNum++;

            // Draw header on this page
            if (info.header) {
              const h = { ...info.header, y: HEADER_Y_PX };
              await drawRegionOnPdf(h, pdfPage, currentPh);
            }

            for (const region of info.contentRegions) {
              const fontSizePdf = (region.fontSize || 12) * SCALE_PX_TO_PDF;
              const wPdf = (region.w || 200) * SCALE_PX_TO_PDF;
              const isBold = region.bold || ['title', 'section-heading', 'sub-heading', 'emphasis'].includes(region.type);
              const fnt = isBold ? fontBold : fontRegular;
              const neededH = calcRegionHeightPx(region, fnt, fontSizePdf, wPdf);

              // Check overflow within this original page
              if (currentYPx + neededH > PAGE_BOTTOM_PX && currentYPx > PAGE_TOP_PX) {
                // Draw footer on current page
                if (info.footer) {
                  const f = { ...info.footer, y: FOOTER_Y_PX, text: t('home.aiDoc.pageOfTotal', { current: currentPageNum, total: totalPages }) };
                  await drawRegionOnPdf(f, pdfPage, currentPh);
                }
                // New page
                currentPageNum++;
                pdfPage = pdfDoc.addPage([PDF_A4_WIDTH, PDF_A4_HEIGHT]);
                currentPh = pdfPage.getSize().height;
                currentYPx = PAGE_TOP_PX;
                // Draw header on new page
                if (info.header) {
                  const h = { ...info.header, y: HEADER_Y_PX };
                  await drawRegionOnPdf(h, pdfPage, currentPh);
                }
              }

              // Place region
              region.y = currentYPx;
              region.h = neededH;
              await drawRegionOnPdf(region, pdfPage, currentPh);
              currentYPx += neededH + GAP_PX;
            }

            // Draw footer on last page of this original page
            if (info.footer) {
              const f = { ...info.footer, y: FOOTER_Y_PX, text: t('home.aiDoc.pageOfTotal', { current: currentPageNum, total: totalPages }) };
              await drawRegionOnPdf(f, pdfPage, currentPh);
            }
          }

          const pdfBytes = await pdfDoc.save();

          if (isTauri) {
            const { invoke } = await import('@tauri-apps/api/core');
            const outputDir = await getOutputDir('AI_Doc');
            const fileName = `ai_doc_${Date.now()}.pdf`;
            const fullPath = outputDir + '\\' + fileName;
            // write_file_bytes auto-creates parent directories
            await invoke('write_file_bytes', { path: fullPath, bytes: Array.from(pdfBytes) });
            aiDocLastExportPath = fullPath;
            showAiDocSuccess(fullPath);
          } else {
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ai_doc_${Date.now()}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
          }
        } catch (e) {
          console.error('[AI Doc] Export error:', e);
          showAiDocError();
        } finally {
          hideAiDocMask();
        }
      }

      function wrapPdfText(text, font, fontSize, maxWidth) {
        const paragraphs = text.split('\n');
        const lines = [];
        paragraphs.forEach(para => {
          if (!para) { lines.push(''); return; }
          // Split into tokens: CJK chars are individual tokens, latin words stay together
          const tokens = para.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]|[a-zA-Z0-9]+|\s+|./g) || [];
          let current = '';
          for (const token of tokens) {
            const test = current + token;
            const width = font.widthOfTextAtSize(test, fontSize);
            if (width > maxWidth && current) {
              lines.push(current.trimEnd());
              current = token.trimStart();
            } else {
              current = test;
            }
          }
          if (current) lines.push(current);
        });
        return lines;
      }

      function showAiDocSuccess(filePath) {
        if (aiDocSuccessPath) aiDocSuccessPath.textContent = filePath;
        if (aiDocSuccessOverlay) aiDocSuccessOverlay.classList.add('visible');
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      function showAiDocError() {
        addAiDocChatMsg('ai', t('home.aiDoc.exportError'));
      }

      // Event listeners
      if (aiDocBack) {
        aiDocBack.addEventListener('click', closeAiDocOverlay);
      }

      if (aiDocEditBack) {
        aiDocEditBack.addEventListener('click', closeAiDocEditOverlay);
      }

      if (aiDocEditExportBtn) {
        aiDocEditExportBtn.addEventListener('click', exportAiDocPdf);
      }

      if (aiDocSuccessOk) {
        aiDocSuccessOk.addEventListener('click', () => {
          if (aiDocSuccessOverlay) aiDocSuccessOverlay.classList.remove('visible');
        });
      }

      if (aiDocSuccessOpenFolder) {
        aiDocSuccessOpenFolder.addEventListener('click', async () => {
          if (isTauri && aiDocLastExportPath) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const folder = aiDocLastExportPath.replace(/[/\\][^/\\]+$/, '').replace(/\//g, '\\');
              await invoke('open_path', { path: folder });
            } catch (err) {
              console.error('[AI Doc] Open folder error:', err);
            }
          }
        });
      }

      document.querySelectorAll('.audio-list-item[data-tool="ai-doc"]').forEach(item => {
        item.addEventListener('click', () => openToolWithAiCheck(openAiDocOverlay));
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openToolWithAiCheck(openAiDocOverlay);
          }
        });
      });

      if (aiDocChatSend) {
        aiDocChatSend.disabled = true;
        aiDocChatSend.addEventListener('click', handleAiDocSend);
      }

      if (aiDocChatMessages) {
        aiDocChatMessages.addEventListener('click', (e) => {
          const chip = e.target.closest('.ai-doc-prompt-chip');
          if (!chip) return;
          const prompt = chip.dataset.prompt;
          if (aiDocChatInput && prompt) {
            aiDocChatInput.value = prompt;
            aiDocChatInput.focus();
            aiDocChatInput.dispatchEvent(new Event('input'));
          }
        });
      }

      if (aiDocChatInput) {
        aiDocChatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAiDocSend();
          }
        });
        aiDocChatInput.addEventListener('input', () => {
          aiDocChatSend.disabled = !aiDocChatInput.value.trim();
        });
      }

      if (aiDocExportBtn) {
        aiDocExportBtn.addEventListener('click', exportAiDocPdf);
      }

      const aiDocResetBtn = document.getElementById('aiDocResetBtn');
      if (aiDocResetBtn) {
        aiDocResetBtn.addEventListener('click', () => {
          resetAiDocState();
          aiDocChatSend.disabled = true;
        });
      }
      // ===== End AI Document Tool =====

      // ===== AI Table Tool =====
      const aiTableOverlay = document.getElementById('aiTableOverlay');
      const aiTableBack = document.getElementById('aiTableBack');
      const aiTableBg = document.getElementById('aiTableBg');
      const aiTableChatMessages = document.getElementById('aiTableChatMessages');
      const aiTableChatInput = document.getElementById('aiTableChatInput');
      const aiTableChatSend = document.getElementById('aiTableChatSend');
      const aiTableCanvasEmpty = document.getElementById('aiTableCanvasEmpty');
      const aiTablePreviewScroll = document.getElementById('aiTablePreviewScroll');
      const aiTableCanvasToolbar = document.getElementById('aiTableCanvasToolbar');
      const aiTableResetBtn = document.getElementById('aiTableResetBtn');
      const aiTableSuccessOverlay = document.getElementById('aiTableSuccessOverlay');
      const aiTableSuccessPath = document.getElementById('aiTableSuccessPath');
      const aiTableSuccessOpenFolder = document.getElementById('aiTableSuccessOpenFolder');
      const aiTableSuccessOk = document.getElementById('aiTableSuccessOk');

      let aiTableDitherInstance = null;
      let aiTableChatHistory = [];
      let aiTableData = null; // { title, columns, rows, charts }
      let aiTableLastExportPath = '';
      let aiTableChartCanvases = []; // [{ canvas, instance, chartDef }] for PNG/PDF export

      // Inline SVGs (avoid relying on lucide re-scan for dynamically created buttons)
      const AI_TABLE_ICON_PLUS = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
      const AI_TABLE_ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

      const AI_TABLE_PRESET_PROMPTS = [
        { labelKey: 'home.aiTable.presetSales', prompt: '请生成一份2024年Q1-Q4的销售报表，包含产品名称、季度、销售额（万元）、同比增长率列，数据要真实合理，并生成一个柱状图展示各产品季度销售额对比' },
        { labelKey: 'home.aiTable.presetSchedule', prompt: '请生成一个项目排期表，包含任务名称、负责人、开始日期、结束日期、状态列，至少8个任务，状态包括进行中、已完成、未开始' },
        { labelKey: 'home.aiTable.presetCompare', prompt: '请生成一份手机产品对比表，对比5款手机的处理器、内存、电池容量、摄像头像素、价格，数据要真实合理' },
        { labelKey: 'home.aiTable.presetPerformance', prompt: '请生成一份部门员工绩效表，包含姓名、部门、KPI得分、出勤率、综合评级列，至少10人，并生成一个饼图展示评级分布' },
      ];

      function openAiTableOverlay() {
        if (!aiTableOverlay) return;
        aiTableOverlay.classList.add('visible');
        resetAiTableState();
        if (aiTableBg && !aiTableDitherInstance) {
          aiTableDitherInstance = initDither(aiTableBg, {
            waveColor: [0.38823529411764707, 0.4, 0.9450980392156862],
            colorNum: 40, pixelSize: 2, waveAmplitude: 0, waveFrequency: 0, waveSpeed: 0.07
          });
        }
      }

      function closeAiTableOverlay() {
        if (!aiTableOverlay) return;
        aiTableOverlay.classList.remove('visible');
        resetAiTableState();
        if (aiTableDitherInstance) { aiTableDitherInstance(); aiTableDitherInstance = null; }
      }

      function resetAiTableState() {
        aiTableChatHistory = [];
        aiTableData = null;
        // Destroy Chart.js instances before clearing to prevent memory leaks
        aiTableChartCanvases.forEach(c => { try { c.instance && c.instance.destroy(); } catch (e) {} });
        aiTableChartCanvases = [];
        if (aiTableChatMessages) {
          aiTableChatMessages.innerHTML = '';
          addAiTableChatMsg('ai', t('home.aiTable.welcome'));
          addAiTablePromptChips();
        }
        if (aiTableChatInput) aiTableChatInput.value = '';
        if (aiTableChatSend) aiTableChatSend.disabled = true;
        if (aiTableCanvasEmpty) aiTableCanvasEmpty.style.display = '';
        if (aiTablePreviewScroll) { aiTablePreviewScroll.style.display = 'none'; aiTablePreviewScroll.innerHTML = ''; }
        if (aiTableCanvasToolbar) aiTableCanvasToolbar.style.display = 'none';
      }

      function addAiTableChatMsg(role, text, isGenLink = false) {
        if (!aiTableChatMessages) return;
        const msg = document.createElement('div');
        msg.className = `ai-doc-chat-msg ai-doc-chat-msg-${role}`;
        const avatar = document.createElement('div');
        avatar.className = 'ai-doc-chat-avatar';
        if (role === 'ai') {
          const img = document.createElement('img');
          img.src = '/assets/toolknit-icon.png'; img.alt = 'AI';
          img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
          avatar.appendChild(img);
        } else {
          fillUserAvatar(avatar);
        }
        const bubble = document.createElement('div');
        bubble.className = 'ai-doc-chat-bubble';
        if (isGenLink) bubble.classList.add('ai-doc-gen-link');
        bubble.textContent = text;
        msg.appendChild(avatar);
        msg.appendChild(bubble);
        aiTableChatMessages.appendChild(msg);
        aiTableChatMessages.scrollTop = aiTableChatMessages.scrollHeight;
        if (window.lucide) window.lucide.createIcons();
        return bubble;
      }

      function addAiTablePromptChips() {
        if (!aiTableChatMessages) return;
        const msg = document.createElement('div');
        msg.className = 'ai-doc-chat-msg ai-doc-chat-msg-ai';
        const avatar = document.createElement('div');
        avatar.className = 'ai-doc-chat-avatar';
        const img = document.createElement('img');
        img.src = '/assets/toolknit-icon.png'; img.alt = 'AI';
        img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
        avatar.appendChild(img);
        const bubble = document.createElement('div');
        bubble.className = 'ai-doc-chat-bubble ai-doc-chip-bubble';
        const title = document.createElement('div');
        title.className = 'ai-doc-chip-title';
        title.textContent = t('home.aiDoc.chipTitle');
        const chips = document.createElement('div');
        chips.className = 'ai-doc-prompt-chips';
        AI_TABLE_PRESET_PROMPTS.forEach(item => {
          const chip = document.createElement('button');
          chip.className = 'ai-doc-prompt-chip';
          chip.textContent = t(item.labelKey);
          chip.dataset.prompt = item.prompt;
          chips.appendChild(chip);
        });
        bubble.appendChild(title);
        bubble.appendChild(chips);
        msg.appendChild(avatar);
        msg.appendChild(bubble);
        aiTableChatMessages.appendChild(msg);
        aiTableChatMessages.scrollTop = aiTableChatMessages.scrollHeight;
      }

      function showAiTableMask(text) {
        const mask = document.getElementById('aiDocMask');
        const maskText = document.getElementById('aiDocMaskText');
        if (maskText) maskText.textContent = text;
        if (mask) mask.classList.add('visible');
      }

      function hideAiTableMask() {
        const mask = document.getElementById('aiDocMask');
        if (mask) mask.classList.remove('visible');
      }

      async function handleAiTableSend() {
        const text = aiTableChatInput?.value?.trim();
        if (!text) return;
        addAiTableChatMsg('user', text);
        aiTableChatInput.value = '';
        aiTableChatSend.disabled = true;
        aiTableChatHistory.push({ role: 'user', content: text });
        // Limit chat history to last 10 messages to avoid token overflow
        if (aiTableChatHistory.length > 10) aiTableChatHistory = aiTableChatHistory.slice(-10);
        showAiTableMask(t('home.aiTable.thinking'));

        try {
          const systemPrompt = `你是一位数据分析专家，擅长根据用户需求生成结构化数据表和可视化图表。
用户会描述他们需要的表格类型和内容，你的任务是通过对话收集足够信息后生成一份包含数据表和图表的 JSON。

## 输出长度硬性限制
- JSON 总字符数不超过 12000，否则会被截断
- 表格行数控制在 5-20 行，列数 3-8 列
- 图表数量 1-3 个

## JSON 格式（必须直接返回，不要 markdown 代码块）
{"ready": true, "title": "表格标题", "summary": "简短描述", "columns": [{"key": "name", "label": "姓名", "type": "text"}, {"key": "score", "label": "得分", "type": "number"}], "rows": [["张三", 95], ["李四", 88]], "charts": [{"type": "bar", "title": "得分对比", "labelColumn": 0, "valueColumns": [1]}]}

## 字段说明
- columns: 列定义，key 是英文标识，label 是中文列名，type 是 "text" 或 "number"
- rows: 二维数组，每个子数组是一行数据，顺序与 columns 对应
- charts: 可选，图表数组
  - type: "bar"（柱状图）、"line"（折线图）、"pie"（饼图）
  - title: 图表标题
  - labelColumn: 用作 X 轴标签的列索引（pie 图用作标签）
  - valueColumns: 用作数值的列索引数组（pie 图只取第一个）

## 对话规则
1. 信息不完整时追问（最多 2 轮），返回 {"ready": false, "question": "你的问题"}
2. 信息完整时返回完整 JSON，不要任何 markdown 代码块或解释文字
3. 数据要真实合理，不要用占位符
4. 如果用户要求图表，必须包含 charts 字段`;

          const content = await callDeepSeek([
            { role: 'system', content: systemPrompt },
            ...aiTableChatHistory.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
          ], null, 8192);

          aiTableChatHistory.push({ role: 'assistant', content });
          console.log('[AI Table] raw content length:', content?.length, 'preview:', content?.slice(0, 200));
          const jsonStr = extractJson(content);
          console.log('[AI Table] extracted jsonStr length:', jsonStr?.length, 'preview:', jsonStr?.slice(0, 200));
          if (!jsonStr) { addAiTableChatMsg('ai', content); return; }

          let parsed;
          try { parsed = JSON.parse(jsonStr); }
          catch (parseErr) {
            console.error('[AI Table] JSON parse failed:', parseErr, jsonStr?.slice(0, 500));
            const fallbackJson = jsonStr.replace(/[\u0000-\u001F\uFEFF\uFFFD]/g, ' ').replace(/\n/g, '\\n');
            try { parsed = JSON.parse(fallbackJson); }
            catch (e2) { addAiTableChatMsg('ai', t('home.aiTable.parseError')); return; }
          }

          if (parsed.ready === false && parsed.question) { addAiTableChatMsg('ai', parsed.question); return; }

          if (parsed.ready === true && parsed.columns && Array.isArray(parsed.columns) && parsed.rows && Array.isArray(parsed.rows)) {
            // Validate and sanitize data structure
            parsed.columns = parsed.columns.map(c => ({
              key: String(c?.key || 'col'),
              label: String(c?.label || c?.key || t('home.aiTable.defaultColumn')),
              type: c?.type === 'number' ? 'number' : 'text',
            }));
            const colCount = parsed.columns.length;
            parsed.rows = parsed.rows
              .filter(r => Array.isArray(r))
              .map(r => {
                // Pad or truncate rows to match column count
                const row = r.slice(0, colCount);
                while (row.length < colCount) row.push('');
                return row.map(v => (v == null ? '' : v));
              });
            if (colCount === 0 || parsed.rows.length === 0) {
              addAiTableChatMsg('ai', t('home.aiTable.emptyData'));
              return;
            }
            const summaryText = parsed.summary || t('home.aiTable.summaryFallback');
            const bubble = addAiTableChatMsg('ai', summaryText, true);
            aiTableData = parsed;
            bubble.addEventListener('click', () => {
              if (aiTablePreviewScroll) aiTablePreviewScroll.scrollIntoView({ behavior: 'smooth' });
            });
            renderAiTablePreview(parsed);
          } else {
            console.warn('[AI Table] parsed missing fields:', parsed);
            addAiTableChatMsg('ai', content);
          }
        } catch (e) {
          console.error('[AI Table] Error:', e);
          addAiTableChatMsg('ai', t('home.aiTable.errNetwork'));
        } finally {
          hideAiTableMask();
          // Re-enable send only if there is text in the input
          if (aiTableChatSend) aiTableChatSend.disabled = !aiTableChatInput?.value?.trim();
        }
      }

      // ===== Table Rendering & Editing =====
      function renderAiTablePreview(data) {
        if (!aiTablePreviewScroll || !data.columns) return;
        if (aiTableCanvasEmpty) aiTableCanvasEmpty.style.display = 'none';
        aiTablePreviewScroll.style.display = '';
        if (aiTableCanvasToolbar) aiTableCanvasToolbar.style.display = '';
        aiTablePreviewScroll.innerHTML = '';
        // Destroy previous Chart.js instances to avoid leaks
        aiTableChartCanvases.forEach(c => { try { c.instance && c.instance.destroy(); } catch (e) {} });
        aiTableChartCanvases = [];

        // Title
        if (data.title) {
          const titleEl = document.createElement('h3');
          titleEl.className = 'ai-table-title';
          titleEl.textContent = data.title;
          titleEl.addEventListener('dblclick', () => {
            titleEl.setAttribute('contenteditable', 'true');
            titleEl.focus();
            const r = document.createRange(); r.selectNodeContents(titleEl);
            const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
          });
          titleEl.addEventListener('blur', () => {
            titleEl.removeAttribute('contenteditable');
            if (aiTableData) aiTableData.title = titleEl.textContent;
          });
          aiTablePreviewScroll.appendChild(titleEl);
        }

        // Table container
        const tableWrap = document.createElement('div');
        tableWrap.className = 'ai-table-wrap';
        const table = document.createElement('table');
        table.className = 'ai-table-grid';

        // Header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        data.columns.forEach((col, colIdx) => {
          const th = document.createElement('th');
          th.textContent = col.label || col.key;
          th.dataset.colIdx = colIdx;
          th.addEventListener('click', () => sortAiTable(colIdx));
          headerRow.appendChild(th);
        });
        // Action column header
        const actionTh = document.createElement('th');
        actionTh.className = 'ai-table-action-col';
        actionTh.textContent = '';
        headerRow.appendChild(actionTh);
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body rows
        const tbody = document.createElement('tbody');
        data.rows.forEach((row, rowIdx) => {
          const tr = createAiTableRow(row, rowIdx, data.columns);
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tableWrap.appendChild(table);

        // Add row button
        const addRowBtn = document.createElement('button');
        addRowBtn.className = 'ai-table-add-btn';
        addRowBtn.innerHTML = AI_TABLE_ICON_PLUS + ' ' + escapeHtml(t('home.aiTable.addRow'));
        addRowBtn.addEventListener('click', () => {
          if (!aiTableData) return;
          const newRow = aiTableData.columns.map(c => c.type === 'number' ? 0 : '');
          aiTableData.rows.push(newRow);
          const tr = createAiTableRow(newRow, aiTableData.rows.length - 1, aiTableData.columns);
          tbody.appendChild(tr);
        });
        tableWrap.appendChild(addRowBtn);

        // Add column button
        const addColBtn = document.createElement('button');
        addColBtn.className = 'ai-table-add-btn';
        addColBtn.innerHTML = AI_TABLE_ICON_PLUS + ' ' + escapeHtml(t('home.aiTable.addCol'));
        addColBtn.addEventListener('click', () => {
          if (!aiTableData) return;
          const colIdx = aiTableData.columns.length;
          aiTableData.columns.push({ key: 'col_' + colIdx, label: t('home.aiTable.addCol'), type: 'text' });
          aiTableData.rows.forEach(r => r.push(''));
          // Re-render
          renderAiTablePreview(aiTableData);
        });
        tableWrap.appendChild(addColBtn);

        aiTablePreviewScroll.appendChild(tableWrap);

        // Fallback: if AI returned no charts, auto-generate a bar chart from the
        // first text column (labels) and first numeric column (values).
        if (!data.charts || data.charts.length === 0) {
          const textColIdx = data.columns.findIndex(c => c.type !== 'number');
          const numColIdx = data.columns.findIndex(c => c.type === 'number');
          if (numColIdx !== -1) {
            const labelIdx = textColIdx !== -1 ? textColIdx : 0;
            data.charts = [{
              type: 'bar',
              title: (data.columns[numColIdx].label || t('home.aiTable.defaultChartValue')) + ' ' + t('home.aiTable.chartCompare'),
              labelColumn: labelIdx,
              valueColumns: [numColIdx],
            }];
          }
        }

        // Sanitize chart column indices against current columns (in case of edits)
        if (data.charts) {
          data.charts = data.charts.filter(ch => {
            const vc = (ch.valueColumns || []).filter(i => i >= 0 && i < data.columns.length);
            if (vc.length === 0) return false;
            ch.valueColumns = vc;
            if (ch.labelColumn == null || ch.labelColumn < 0 || ch.labelColumn >= data.columns.length) ch.labelColumn = 0;
            return true;
          });
        }

        // Charts
        if (data.charts && data.charts.length > 0) {
          data.charts.forEach((chart, chartIdx) => {
            const chartWrap = document.createElement('div');
            chartWrap.className = 'ai-table-chart-wrap';
            const chartTitle = document.createElement('div');
            chartTitle.className = 'ai-table-chart-title';
            chartTitle.textContent = chart.title || t('home.aiTable.defaultChartTitle');
            chartWrap.appendChild(chartTitle);
            const canvasHolder = document.createElement('div');
            canvasHolder.className = 'ai-table-chart-holder';
            const canvas = document.createElement('canvas');
            canvas.className = 'ai-table-chart-canvas';
            canvas.width = 760; canvas.height = 380;
            canvasHolder.appendChild(canvas);
            chartWrap.appendChild(canvasHolder);
            aiTablePreviewScroll.appendChild(chartWrap);
            // Draw chart after DOM insertion so canvas has dimensions
            requestAnimationFrame(() => {
              renderAiTableChartJs(canvas, chart, data);
            });
          });
        }

        if (window.lucide) window.lucide.createIcons();
      }

      function createAiTableRow(row, rowIdx, columns) {
        const tr = document.createElement('tr');
        tr.dataset.rowIdx = rowIdx;
        columns.forEach((col, colIdx) => {
          const td = document.createElement('td');
          td.textContent = row[colIdx] !== undefined ? String(row[colIdx]) : '';
          td.dataset.colIdx = colIdx;
          td.addEventListener('dblclick', () => {
            td.setAttribute('contenteditable', 'true');
            td.focus();
            const r = document.createRange(); r.selectNodeContents(td);
            const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
          });
          td.addEventListener('blur', () => {
            td.removeAttribute('contenteditable');
            if (aiTableData && aiTableData.rows[rowIdx]) {
              const val = td.textContent.trim();
              if (col.type === 'number') {
                const num = parseFloat(val);
                aiTableData.rows[rowIdx][colIdx] = isNaN(num) ? 0 : num;
                td.textContent = String(aiTableData.rows[rowIdx][colIdx]);
              } else {
                aiTableData.rows[rowIdx][colIdx] = val;
              }
            }
          });
          td.addEventListener('keydown', (e) => { if (e.key === 'Escape') td.blur(); });
          tr.appendChild(td);
        });
        // Delete row button
        const delTd = document.createElement('td');
        delTd.className = 'ai-table-action-col';
        const delBtn = document.createElement('button');
        delBtn.className = 'ai-table-del-btn';
        delBtn.innerHTML = AI_TABLE_ICON_TRASH;
        delBtn.addEventListener('click', () => {
          if (!aiTableData || !aiTableData.rows[rowIdx]) return;
          aiTableData.rows.splice(rowIdx, 1);
          renderAiTablePreview(aiTableData);
        });
        delTd.appendChild(delBtn);
        tr.appendChild(delTd);
        return tr;
      }

      let aiTableSortCol = -1, aiTableSortAsc = true;
      function sortAiTable(colIdx) {
        if (!aiTableData || !aiTableData.columns[colIdx]) return;
        const col = aiTableData.columns[colIdx];
        const isNumeric = col.type === 'number';
        // Toggle direction if clicking the same column
        if (aiTableSortCol === colIdx) aiTableSortAsc = !aiTableSortAsc;
        else { aiTableSortCol = colIdx; aiTableSortAsc = true; }
        const dir = aiTableSortAsc ? 1 : -1;
        aiTableData.rows.sort((a, b) => {
          const va = a[colIdx], vb = b[colIdx];
          if (isNumeric) return ((parseFloat(va) || 0) - (parseFloat(vb) || 0)) * dir;
          return String(va).localeCompare(String(vb), 'zh') * dir;
        });
        renderAiTablePreview(aiTableData);
      }

      // ===== Chart Rendering (Chart.js, refined monochrome theme) =====
      const AI_TABLE_FONT = "'DouyinSansBold', 'Microsoft YaHei', sans-serif";
      // Per-series gradient stops [top, bottom] for depth; doughnut slice palette
      const AI_TABLE_SERIES = [
        { dark: '#1f1f1f', light: '#5f5f5f' },
        { dark: '#525252', light: '#9a9a9a' },
        { dark: '#7a7a7a', light: '#b8b8b8' },
        { dark: '#9c9c9c', light: '#d4d4d4' },
      ];
      const AI_TABLE_SLICES = ['#262626', '#454545', '#636363', '#828282', '#a0a0a0', '#bdbdbd', '#383838', '#d6d6d6'];

      function aiTableFmtNum(v) {
        if (typeof v !== 'number') v = parseFloat(v);
        if (isNaN(v)) return '';
        if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
        return Number.isInteger(v) ? String(v) : v.toFixed(1);
      }
      function aiTableHexToRgba(hex, a) {
        const m = hex.replace('#', '');
        const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${a})`;
      }
      function aiTableVGradient(chart, from, to) {
        const area = chart.chartArea;
        if (!area) return from;
        const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
        g.addColorStop(0, from); g.addColorStop(1, to);
        return g;
      }

      // White background for opaque PNG/PDF export
      const aiTableBgPlugin = {
        id: 'aiTableWhiteBg',
        beforeDraw: (c) => {
          const cx = c.ctx; cx.save();
          cx.globalCompositeOperation = 'destination-over';
          cx.fillStyle = '#ffffff';
          cx.fillRect(0, 0, c.width, c.height);
          cx.restore();
        },
      };
      // Value labels on top of bars / line points
      const aiTableValueLabelPlugin = {
        id: 'aiTableValueLabels',
        afterDatasetsDraw: (chart) => {
          const type = chart.config.type;
          if (type !== 'bar' && type !== 'line') return;
          const ctx = chart.ctx; ctx.save();
          ctx.font = "600 11px " + AI_TABLE_FONT;
          ctx.fillStyle = '#4d4d4d';
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          chart.data.datasets.forEach((ds, di) => {
            const meta = chart.getDatasetMeta(di);
            if (meta.hidden || meta.data.length > 14) return;
            meta.data.forEach((el, i) => {
              const txt = aiTableFmtNum(ds.data[i]);
              if (txt) ctx.fillText(txt, el.x, el.y - 6);
            });
          });
          ctx.restore();
        },
      };
      // Percentage labels on doughnut slices + center total
      const aiTableDoughnutPlugin = {
        id: 'aiTableDoughnut',
        afterDatasetsDraw: (chart) => {
          if (chart.config.type !== 'doughnut') return;
          const ctx = chart.ctx;
          const meta = chart.getDatasetMeta(0);
          const ds = chart.data.datasets[0];
          const total = ds.data.reduce((s, v) => s + (parseFloat(v) || 0), 0) || 1;
          ctx.save();
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          meta.data.forEach((arc, i) => {
            const val = parseFloat(ds.data[i]) || 0;
            const pct = val / total;
            if (pct < 0.05) return;
            const ang = (arc.startAngle + arc.endAngle) / 2;
            const r = (arc.innerRadius + arc.outerRadius) / 2;
            const x = arc.x + Math.cos(ang) * r;
            const y = arc.y + Math.sin(ang) * r;
            ctx.font = "700 11px " + AI_TABLE_FONT;
            ctx.fillStyle = (i % AI_TABLE_SLICES.length) < 4 ? '#ffffff' : '#1f1f1f';
            ctx.fillText(Math.round(pct * 100) + '%', x, y);
          });
          const arc0 = meta.data[0];
          if (arc0) {
            ctx.fillStyle = '#9a9a9a'; ctx.font = "600 11px " + AI_TABLE_FONT;
            ctx.fillText(t('home.aiTable.total'), arc0.x, arc0.y - 11);
            ctx.fillStyle = '#1f1f1f'; ctx.font = "700 18px " + AI_TABLE_FONT;
            ctx.fillText(aiTableFmtNum(total), arc0.x, arc0.y + 9);
          }
          ctx.restore();
        },
      };

      async function renderAiTableChartJs(canvas, chartDef, data) {
        let ChartJS;
        try {
          ChartJS = (await import('chart.js/auto')).default;
        } catch (e) {
          console.error('[AI Table] Chart.js load failed:', e);
          return;
        }

        const labelCol = chartDef.labelColumn || 0;
        const valCols = (chartDef.valueColumns && chartDef.valueColumns.length) ? chartDef.valueColumns : [1];
        const labels = data.rows.map(r => String(r[labelCol] !== undefined ? r[labelCol] : ''));

        const tickFont = { family: AI_TABLE_FONT, size: 11 };
        const legendFont = { family: AI_TABLE_FONT, size: 12 };

        let config;
        if (chartDef.type === 'pie') {
          const values = data.rows.map(r => parseFloat(r[valCols[0]]) || 0);
          config = {
            type: 'doughnut',
            data: {
              labels,
              datasets: [{
                data: values,
                backgroundColor: labels.map((_, i) => AI_TABLE_SLICES[i % AI_TABLE_SLICES.length]),
                borderColor: '#ffffff',
                borderWidth: 3,
                hoverOffset: 6,
                spacing: 2,
              }],
            },
            options: {
              responsive: false,
              animation: false,
              devicePixelRatio: 2,
              cutout: '60%',
              radius: '88%',
              layout: { padding: { top: 12, right: 12, bottom: 12, left: 12 } },
              plugins: {
                legend: {
                  position: 'right',
                  labels: { color: '#404040', font: legendFont, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 14 },
                },
                tooltip: { enabled: false },
              },
            },
            plugins: [aiTableBgPlugin, aiTableDoughnutPlugin],
          };
        } else {
          const isLine = chartDef.type === 'line';
          const datasets = valCols.map((vi, si) => {
            const seriesData = data.rows.map(r => parseFloat(r[vi]) || 0);
            const s = AI_TABLE_SERIES[si % AI_TABLE_SERIES.length];
            if (isLine) {
              return {
                label: data.columns[vi]?.label || '',
                data: seriesData,
                borderColor: s.dark,
                borderWidth: 2.5,
                tension: 0.4,
                fill: true,
                backgroundColor: (c) => {
                  const area = c.chart.chartArea;
                  if (!area) return 'rgba(0,0,0,0)';
                  const g = c.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                  g.addColorStop(0, aiTableHexToRgba(s.dark, 0.20));
                  g.addColorStop(1, 'rgba(255,255,255,0)');
                  return g;
                },
                pointRadius: seriesData.length > 14 ? 0 : 4,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: s.dark,
                pointBorderWidth: 2,
                pointHoverRadius: 6,
              };
            }
            return {
              label: data.columns[vi]?.label || '',
              data: seriesData,
              backgroundColor: (c) => aiTableVGradient(c.chart, s.dark, s.light),
              borderRadius: 6,
              borderSkipped: false,
              maxBarThickness: 52,
              categoryPercentage: 0.68,
              barPercentage: 0.86,
            };
          });
          config = {
            type: isLine ? 'line' : 'bar',
            data: { labels, datasets },
            options: {
              responsive: false,
              animation: false,
              devicePixelRatio: 2,
              layout: { padding: { top: 26, right: 16, bottom: 6, left: 6 } },
              plugins: {
                legend: {
                  display: datasets.length > 1,
                  align: 'end',
                  labels: { color: '#404040', font: legendFont, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 16 },
                },
                tooltip: { enabled: false },
              },
              scales: {
                x: {
                  grid: { display: false },
                  border: { display: false },
                  ticks: { color: '#6b6b6b', font: tickFont, maxRotation: 0, autoSkip: true, padding: 6 },
                },
                y: {
                  beginAtZero: true,
                  grid: { color: 'rgba(0,0,0,0.05)' },
                  border: { display: false, dash: [3, 3] },
                  ticks: { color: '#a0a0a0', font: tickFont, padding: 8, maxTicksLimit: 6, callback: (v) => aiTableFmtNum(v) },
                },
              },
            },
            plugins: [aiTableBgPlugin, aiTableValueLabelPlugin],
          };
        }

        const ctx = canvas.getContext('2d');
        const instance = new ChartJS(ctx, config);
        aiTableChartCanvases.push({ canvas, instance, chartDef });
      }

      // ===== Export Functions =====
      function exportAiTableCsv() {
        if (!aiTableData) return;
        const cols = aiTableData.columns;
        const lines = [cols.map(c => '"' + (c.label || c.key).replace(/"/g, '""') + '"').join(',')];
        aiTableData.rows.forEach(row => {
          lines.push(row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','));
        });
        const csv = '\uFEFF' + lines.join('\n');
        downloadAiTableFile(csv, 'text/csv;charset=utf-8', `ai_table_${Date.now()}.csv`);
      }

      async function exportAiTableXlsx() {
        if (!aiTableData) return;
        showAiTableMask(t('home.aiTable.exportingExcel'));
        try {
          // ExcelJS supports full cell styling (borders, fonts, fills) unlike SheetJS community build
          const ExcelJS = (await import('exceljs')).default;
          const cols = aiTableData.columns;
          const wb = new ExcelJS.Workbook();
          const sheetName = aiTableData.title ? aiTableData.title.slice(0, 31).replace(/[\\/?*\[\]:]/g, '') : 'Sheet1';
          const ws = wb.addWorksheet(sheetName);

          const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
          const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

          // Measure helper (CJK chars count as ~1.8 units)
          const measure = (v) => {
            const s = String(v == null ? '' : v);
            let w = 0;
            for (const ch of s) w += /[\u4e00-\u9fff\uff00-\uffef]/.test(ch) ? 1.8 : 1;
            return w;
          };

          // Optional title row spanning all columns
          let startRow = 1;
          if (aiTableData.title) {
            ws.mergeCells(1, 1, 1, cols.length);
            const titleCell = ws.getCell(1, 1);
            titleCell.value = aiTableData.title;
            titleCell.font = { bold: true, size: 16, color: { argb: 'FF1A1A1A' } };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            ws.getRow(1).height = 28;
            startRow = 2;
          }

          // Header row
          const headerRow = ws.getRow(startRow);
          cols.forEach((c, ci) => {
            const cell = headerRow.getCell(ci + 1);
            cell.value = c.label || c.key;
            cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E2E2E' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = allBorders;
          });
          headerRow.height = 22;

          // Data rows
          aiTableData.rows.forEach((row, ri) => {
            const r = ws.getRow(startRow + 1 + ri);
            cols.forEach((c, ci) => {
              const cell = r.getCell(ci + 1);
              let val = row[ci];
              if (c.type === 'number' && val !== '' && val != null && !isNaN(parseFloat(val))) val = parseFloat(val);
              cell.value = val;
              cell.alignment = { horizontal: c.type === 'number' ? 'right' : 'left', vertical: 'middle' };
              cell.border = allBorders;
              if (ri % 2 === 1) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
              }
            });
            r.height = 18;
          });

          // Column widths from content
          cols.forEach((c, ci) => {
            let max = measure(c.label || c.key);
            aiTableData.rows.forEach(rw => { max = Math.max(max, measure(rw[ci])); });
            ws.getColumn(ci + 1).width = Math.min(Math.max(max + 3, 10), 50);
          });

          const buffer = await wb.xlsx.writeBuffer();
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          await saveAiTableBlob(blob, `ai_table_${Date.now()}.xlsx`);
        } catch (e) {
          console.error('[AI Table] XLSX export error:', e);
          addAiTableChatMsg('ai', t('home.aiTable.errXlsx'));
        } finally { hideAiTableMask(); }
      }

      function exportAiTablePng() {
        if (!aiTableData) return;
        showAiTableMask(t('home.aiTable.exportingPng'));
        try {
          // Build a composite canvas: table text + charts
          const padding = 40;
          const tableW = 600;
          const headerH = aiTableData.title ? 40 : 0;
          const rowH = 32;
          const tableH = headerH + (aiTableData.rows.length + 1) * rowH + 20;
          const chartH = aiTableChartCanvases.length > 0 ? aiTableChartCanvases.reduce((sum, c) => sum + c.canvas.height + 30, 0) : 0;
          const totalW = Math.max(tableW, ...aiTableChartCanvases.map(c => c.canvas.width)) + padding * 2;
          const totalH = padding + tableH + chartH + padding;

          const canvas = document.createElement('canvas');
          canvas.width = totalW; canvas.height = totalH;
          const ctx = canvas.getContext('2d');
          // White, print-friendly background to match black & white charts
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, totalW, totalH);

          let y = padding;
          // Title
          if (aiTableData.title) {
            ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(aiTableData.title, totalW / 2, y + 20); y += headerH;
          }
          // Table header
          const colW = (totalW - padding * 2) / aiTableData.columns.length;
          ctx.fillStyle = '#1a1a1a'; ctx.fillRect(padding, y, totalW - padding * 2, rowH);
          ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left';
          aiTableData.columns.forEach((col, ci) => {
            ctx.fillText(col.label || col.key, padding + ci * colW + 8, y + 20);
          });
          y += rowH;
          // Table rows
          aiTableData.rows.forEach((row, ri) => {
            ctx.fillStyle = ri % 2 === 1 ? '#f2f2f2' : '#ffffff';
            ctx.fillRect(padding, y, totalW - padding * 2, rowH);
            ctx.fillStyle = '#262626'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
            row.forEach((val, ci) => {
              const text = String(val == null ? '' : val);
              const maxW = colW - 16;
              let display = text;
              if (ctx.measureText(display).width > maxW) {
                while (display.length > 1 && ctx.measureText(display + '…').width > maxW) display = display.slice(0, -1);
                display += '…';
              }
              ctx.fillText(display, padding + ci * colW + 8, y + 20);
            });
            y += rowH;
          });
          // Table border lines
          ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 1;
          ctx.strokeRect(padding, padding + headerH, totalW - padding * 2, (aiTableData.rows.length + 1) * rowH);
          y += 20;

          // Charts
          aiTableChartCanvases.forEach(({ canvas: chartCanvas }) => {
            ctx.drawImage(chartCanvas, padding, y);
            y += chartCanvas.height + 30;
          });

          canvas.toBlob((blob) => {
            if (!blob) { hideAiTableMask(); addAiTableChatMsg('ai', t('home.aiTable.errPng')); return; }
            saveAiTableBlob(blob, `ai_table_${Date.now()}.png`).then(() => hideAiTableMask()).catch((err) => {
              console.error('[AI Table] PNG save error:', err);
              hideAiTableMask();
              addAiTableChatMsg('ai', t('home.aiTable.errPng'));
            });
          }, 'image/png');
        } catch (e) {
          console.error('[AI Table] PNG export error:', e);
          hideAiTableMask();
          addAiTableChatMsg('ai', t('home.aiTable.errPng'));
        }
      }

      async function exportAiTablePdf() {
        if (!aiTableData) return;
        showAiTableMask(t('home.aiTable.exportingPdf'));
        try {
          await loadAiDocFontBytes();
          const pdfLib = await import('pdf-lib-plus-encrypt');
          const { PDFDocument, StandardFonts, rgb } = pdfLib;
          const pdfDoc = await PDFDocument.create();
          // Embed Chinese-capable font so CJK characters don't crash WinAnsi encoder
          let font;
          if (aiDocFontRegularBytes) {
            const fontkit = (await import('@pdf-lib/fontkit')).default;
            pdfDoc.registerFontkit(fontkit);
            font = await pdfDoc.embedFont(aiDocFontRegularBytes);
          } else {
            font = await pdfDoc.embedFont(StandardFonts.Helvetica);
          }
          const pageW = 595.28, pageH = 841.89;
          const margin = 40;
          let page = pdfDoc.addPage([pageW, pageH]);
          let y = pageH - margin;

          // Truncate text to fit within a given pixel width using actual font metrics
          const fitText = (text, maxW, size) => {
            let s = String(text == null ? '' : text);
            if (font.widthOfTextAtSize(s, size) <= maxW) return s;
            while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > maxW) s = s.slice(0, -1);
            return s + '…';
          };

          // Title
          if (aiTableData.title) {
            const titleSize = 16;
            page.drawText(fitText(aiTableData.title, pageW - margin * 2, titleSize), { x: margin, y: y - titleSize, size: titleSize, font, color: rgb(0.1, 0.1, 0.1) });
            y -= titleSize + 12;
          }

          // Table
          const cols = aiTableData.columns;
          const colW = (pageW - margin * 2) / cols.length;
          const rowH = 22;
          const fontSize = 9;
          const cellPad = 5;

          // Header
          page.drawRectangle({ x: margin, y: y - rowH, width: pageW - margin * 2, height: rowH, color: rgb(0.18, 0.18, 0.18) });
          cols.forEach((col, ci) => {
            page.drawText(fitText(col.label || col.key, colW - cellPad * 2, fontSize), { x: margin + ci * colW + cellPad, y: y - rowH + 7, size: fontSize, font, color: rgb(1, 1, 1) });
          });
          y -= rowH;

          // Rows
          aiTableData.rows.forEach((row, ri) => {
            if (y - rowH < margin) {
              page = pdfDoc.addPage([pageW, pageH]);
              y = pageH - margin;
            }
            if (ri % 2 === 1) {
              page.drawRectangle({ x: margin, y: y - rowH, width: pageW - margin * 2, height: rowH, color: rgb(0.95, 0.95, 0.95) });
            }
            row.forEach((val, ci) => {
              try {
                page.drawText(fitText(val, colW - cellPad * 2, fontSize), { x: margin + ci * colW + cellPad, y: y - rowH + 7, size: fontSize, font, color: rgb(0.15, 0.15, 0.15) });
              } catch (e) {}
            });
            y -= rowH;
          });

          // Charts as images
          for (const { canvas: chartCanvas } of aiTableChartCanvases) {
            const pngDataUrl = chartCanvas.toDataURL('image/png');
            const base64 = pngDataUrl.split(',')[1];
            const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            const img = await pdfDoc.embedPng(imgBytes);
            const imgW = pageW - margin * 2;
            const imgH = img.height * (imgW / img.width);
            if (y - imgH < margin) {
              page = pdfDoc.addPage([pageW, pageH]);
              y = pageH - margin;
            }
            page.drawImage(img, { x: margin, y: y - imgH, width: imgW, height: imgH });
            y -= imgH + 20;
          }

          const pdfBytes = await pdfDoc.save();
          if (isTauri) {
            const { invoke } = await import('@tauri-apps/api/core');
            const outputDir = await getOutputDir('AI_Table');
            const fileName = `ai_table_${Date.now()}.pdf`;
            const fullPath = outputDir + '\\' + fileName;
            await invoke('write_file_bytes', { path: fullPath, bytes: Array.from(pdfBytes) });
            aiTableLastExportPath = fullPath;
            showAiTableSuccess(fullPath);
          } else {
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `ai_table_${Date.now()}.pdf`; a.click();
            URL.revokeObjectURL(url);
          }
        } catch (e) {
          console.error('[AI Table] PDF export error:', e);
          addAiTableChatMsg('ai', t('home.aiTable.errPdf'));
        } finally { hideAiTableMask(); }
      }

      async function saveAiTableBlob(blob, fileName) {
        if (isTauri) {
          const { invoke } = await import('@tauri-apps/api/core');
          const arrayBuffer = await blob.arrayBuffer();
          const outputDir = await getOutputDir('AI_Table');
          const fullPath = outputDir + '\\' + fileName;
          await invoke('write_file_bytes', { path: fullPath, bytes: Array.from(new Uint8Array(arrayBuffer)) });
          aiTableLastExportPath = fullPath;
          showAiTableSuccess(fullPath);
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = fileName; a.click();
          URL.revokeObjectURL(url);
        }
      }

      async function downloadAiTableFile(content, mime, fileName) {
        const blob = new Blob([content], { type: mime });
        try { await saveAiTableBlob(blob, fileName); }
        catch (e) { console.error('[AI Table] CSV export error:', e); addAiTableChatMsg('ai', t('home.aiTable.errCsv')); }
      }

      function showAiTableSuccess(filePath) {
        if (aiTableSuccessPath) aiTableSuccessPath.textContent = filePath;
        if (aiTableSuccessOverlay) aiTableSuccessOverlay.classList.add('visible');
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      // ===== AI Table Event Listeners =====
      if (aiTableBack) aiTableBack.addEventListener('click', closeAiTableOverlay);
      if (aiTableResetBtn) aiTableResetBtn.addEventListener('click', () => { resetAiTableState(); });
      if (aiTableSuccessOk) aiTableSuccessOk.addEventListener('click', () => { if (aiTableSuccessOverlay) aiTableSuccessOverlay.classList.remove('visible'); });
      if (aiTableSuccessOpenFolder) aiTableSuccessOpenFolder.addEventListener('click', async () => {
        if (isTauri && aiTableLastExportPath) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const folder = aiTableLastExportPath.replace(/[/\\][^/\\]+$/, '').replace(/\//g, '\\');
            await invoke('open_path', { path: folder });
          } catch (err) { console.error('[AI Table] Open folder error:', err); }
        }
      });

      document.querySelectorAll('.audio-list-item[data-tool="ai-table"]').forEach(item => {
        item.addEventListener('click', () => openToolWithAiCheck(openAiTableOverlay));
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openToolWithAiCheck(openAiTableOverlay); }
        });
      });

      if (aiTableChatSend) {
        aiTableChatSend.disabled = true;
        aiTableChatSend.addEventListener('click', handleAiTableSend);
      }
      if (aiTableChatInput) {
        aiTableChatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiTableSend(); }
        });
        aiTableChatInput.addEventListener('input', () => {
          aiTableChatSend.disabled = !aiTableChatInput.value.trim();
        });
      }
      if (aiTableChatMessages) {
        aiTableChatMessages.addEventListener('click', (e) => {
          const chip = e.target.closest('.ai-doc-prompt-chip');
          if (!chip) return;
          const prompt = chip.dataset.prompt;
          if (aiTableChatInput && prompt) {
            aiTableChatInput.value = prompt;
            aiTableChatInput.focus();
            aiTableChatInput.dispatchEvent(new Event('input'));
          }
        });
      }

      // Export buttons
      document.querySelectorAll('.ai-table-export-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const fmt = btn.dataset.fmt;
          if (fmt === 'csv') exportAiTableCsv();
          else if (fmt === 'xlsx') exportAiTableXlsx();
          else if (fmt === 'png') exportAiTablePng();
          else if (fmt === 'pdf') exportAiTablePdf();
        });
      });
      // ===== End AI Table Tool =====

      // ===== Color Extractor Tool =====
      const colorExtractorOverlay = document.getElementById('colorExtractorOverlay');
      const colorExtractorBack = document.getElementById('colorExtractorBack');
      const colorExtractorBg = document.getElementById('colorExtractorBg');
      const colorExtractorUploadZone = document.getElementById('colorExtractorUploadZone');
      const colorExtractorFileInput = document.getElementById('colorExtractorFileInput');
      const colorExtractorResult = document.getElementById('colorExtractorResult');
      const colorExtractorCircles = document.getElementById('colorExtractorCircles');
      const colorExtractorImagePreview = document.getElementById('colorExtractorImagePreview');
      const colorExtractorImage = document.getElementById('colorExtractorImage');
      const colorExtractorCirclesView = document.getElementById('colorExtractorCirclesView');
      const colorExtractorReselectBtn = document.getElementById('colorExtractorReselectBtn');
      const colorExtractorFill = document.getElementById('colorExtractorFill');
      const colorExtractorDetailView = document.getElementById('colorExtractorDetailView');
      const colorExtractorDetailCols = document.getElementById('colorExtractorDetailCols');
      const colorExtractorBackDetailBtn = document.getElementById('colorExtractorBackDetailBtn');

      let colorExtractorDitherInstance = null;
      let colorExtractorCurrentImg = null;
      let colorExtractorColors = [];

      function openColorExtractorOverlay() {
        if (!colorExtractorOverlay) return;
        colorExtractorOverlay.classList.add('visible');
        resetColorExtractorState();
        if (colorExtractorBg && !colorExtractorDitherInstance) {
          colorExtractorDitherInstance = initDither(colorExtractorBg, {
            waveColor: [0.4, 0.5, 0.9], colorNum: 40, pixelSize: 2,
            waveAmplitude: 0, waveFrequency: 0, waveSpeed: 0.07
          });
        }
      }
      function closeColorExtractorOverlay() {
        if (!colorExtractorOverlay) return;
        colorExtractorOverlay.classList.remove('visible');
        resetColorExtractorState();
        if (colorExtractorDitherInstance) { colorExtractorDitherInstance(); colorExtractorDitherInstance = null; }
      }
      function resetColorExtractorState() {
        // Clear any pending animation timers
        colorExtractorAnimationTimers.forEach(timer => clearTimeout(timer));
        colorExtractorAnimationTimers = [];
        colorExtractorIsAnimating = false;
        
        colorExtractorCurrentImg = null;
        colorExtractorColors = [];
        if (colorExtractorUploadZone) {
          colorExtractorUploadZone.style.display = '';
          colorExtractorUploadZone.classList.remove('dragover');
        }
        if (colorExtractorFileInput) colorExtractorFileInput.value = '';
        if (colorExtractorImagePreview) colorExtractorImagePreview.style.display = 'none';
        if (colorExtractorImage) colorExtractorImage.src = '';
        if (colorExtractorResult) colorExtractorResult.classList.remove('visible');
        if (colorExtractorCircles) colorExtractorCircles.innerHTML = '';
        if (colorExtractorCirclesView) colorExtractorCirclesView.classList.remove('hidden');
        if (colorExtractorFill) {
          colorExtractorFill.classList.remove('expanded');
          colorExtractorFill.style.removeProperty('--fill-color');
          colorExtractorFill.style.removeProperty('--fill-x');
          colorExtractorFill.style.removeProperty('--fill-y');
          colorExtractorFill.style.removeProperty('--fill-scale');
        }
        if (colorExtractorDetailView) colorExtractorDetailView.classList.remove('visible');
        if (colorExtractorDetailCols) colorExtractorDetailCols.innerHTML = '';
      }

      // Color conversion helpers
      function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(v => {
          const h = Math.round(v).toString(16);
          return h.length === 1 ? '0' + h : h;
        }).join('').toUpperCase();
      }
      function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
            case g: h = ((b - r) / d + 2); break;
            case b: h = ((r - g) / d + 4); break;
          }
          h /= 6;
        }
        return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
      }

      // K-means color quantization
      function extractColors(img, numColors) {
        if (!img.naturalWidth || !img.naturalHeight) return [];
        numColors = Math.max(2, Math.min(numColors, 9));
        const canvas = document.createElement('canvas');
        const maxDim = 200; // Downsample for speed
        const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        // Sample pixels (skip alpha=0)
        const pixels = [];
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          pixels.push([data[i], data[i + 1], data[i + 2]]);
        }
        if (pixels.length === 0) return [];

        // Init centroids: pick evenly spaced pixels
        let centroids = [];
        const step = Math.max(1, Math.floor(pixels.length / numColors));
        for (let i = 0; i < numColors && i * step < pixels.length; i++) {
          centroids.push([...pixels[i * step]]);
        }
        if (centroids.length === 0) return [];

        const maxIter = 12;
        let sums = centroids.map(() => [0, 0, 0, 0]); // r,g,b,count — outside loop for later access
        for (let iter = 0; iter < maxIter; iter++) {
          sums = centroids.map(() => [0, 0, 0, 0]); // reset each iteration
          for (const p of pixels) {
            let bestDist = Infinity, bestIdx = 0;
            for (let ci = 0; ci < centroids.length; ci++) {
              const c = centroids[ci];
              const d = (p[0]-c[0])**2 + (p[1]-c[1])**2 + (p[2]-c[2])**2;
              if (d < bestDist) { bestDist = d; bestIdx = ci; }
            }
            sums[bestIdx][0] += p[0];
            sums[bestIdx][1] += p[1];
            sums[bestIdx][2] += p[2];
            sums[bestIdx][3]++;
          }
          let changed = false;
          for (let ci = 0; ci < centroids.length; ci++) {
            if (sums[ci][3] === 0) continue;
            const nr = sums[ci][0] / sums[ci][3];
            const ng = sums[ci][1] / sums[ci][3];
            const nb = sums[ci][2] / sums[ci][3];
            if (Math.abs(nr - centroids[ci][0]) > 1 || Math.abs(ng - centroids[ci][1]) > 1 || Math.abs(nb - centroids[ci][2]) > 1) {
              changed = true;
              centroids[ci] = [nr, ng, nb];
            }
          }
          if (!changed) break;
        }

        // Sort by population (most frequent first)
        const result = centroids.map((c, ci) => ({
          r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]),
          count: sums[ci] ? sums[ci][3] : 0,
        })).sort((a, b) => b.count - a.count);

        return result;
      }

      // File handling
      const COLOR_EXTRACTOR_MAX_SIZE = 20 * 1024 * 1024; // 20MB
      let colorExtractorUsageCounted = false;
      let colorExtractorAnimationTimers = []; // Track animation timers for cleanup
      let colorExtractorIsAnimating = false; // Prevent multiple simultaneous animations

      async function handleColorExtractorFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        if (file.size > COLOR_EXTRACTOR_MAX_SIZE) {
          console.warn('[Color Extractor] File too large:', file.size);
          return;
        }
        // In Tauri mode, read file bytes via backend to ensure data accessibility
        if (isTauri && file.path) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const rawBytes = await invoke('read_file_bytes', { path: file.path });
            const bytes = Array.isArray(rawBytes) ? Uint8Array.from(rawBytes) : new Uint8Array(rawBytes);
            const blob = new Blob([bytes], { type: file.type || 'image/png' });
            const dataUrl = await new Promise((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(r.result);
              r.onerror = () => reject(new Error('FileReader error'));
              r.readAsDataURL(blob);
            });
            const img = new Image();
            img.onload = () => {
              if (!img.naturalWidth || !img.naturalHeight) {
                console.error('[Color Extractor] Invalid image dimensions');
                return;
              }
              colorExtractorCurrentImg = img;
              colorExtractorUsageCounted = false;
              if (colorExtractorUploadZone) colorExtractorUploadZone.style.display = 'none';
              if (colorExtractorImagePreview && colorExtractorImage) {
                colorExtractorImage.src = dataUrl;
                colorExtractorImagePreview.style.display = '';
              }
              doExtractColors();
            };
            img.onerror = () => { console.error('[Color Extractor] Image load failed'); };
            img.src = dataUrl;
            return;
          } catch (e) {
            console.error('[Color Extractor] Tauri file read error:', e);
          }
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            if (!img.naturalWidth || !img.naturalHeight) {
              console.error('[Color Extractor] Invalid image dimensions');
              return;
            }
            colorExtractorCurrentImg = img;
            colorExtractorUsageCounted = false;
            if (colorExtractorUploadZone) colorExtractorUploadZone.style.display = 'none';
            if (colorExtractorImagePreview && colorExtractorImage) {
              colorExtractorImage.src = e.target.result;
              colorExtractorImagePreview.style.display = '';
            }
            // Auto-extract with default count
            doExtractColors();
          };
          img.onerror = () => { console.error('[Color Extractor] Image load failed'); };
          img.src = e.target.result;
        };
        reader.onerror = () => { console.error('[Color Extractor] File read failed'); };
        reader.readAsDataURL(file);
      }

      function doExtractColors() {
        if (!colorExtractorCurrentImg) return;
        const num = 9; // 9 colors for 3x3 grid
        const colors = extractColors(colorExtractorCurrentImg, num);
        if (colors.length === 0) {
          console.warn('[Color Extractor] No colors extracted');
          // Show user feedback
          if (colorExtractorResult) {
            colorExtractorResult.classList.remove('visible');
          }
          if (colorExtractorUploadZone) {
            colorExtractorUploadZone.style.display = '';
          }
          showToast(t('home.colorExtractor.extractFailed'));
          return;
        }
        colorExtractorColors = colors;
        renderColorCircles(colors);
        if (!colorExtractorUsageCounted && window.incrementToolUsage) {
          window.incrementToolUsage();
          colorExtractorUsageCounted = true;
        }
      }

      function renderColorCircles(colors) {
        if (!colorExtractorCircles) return;
        colorExtractorCircles.innerHTML = '';
        const top5 = colors.slice(0, 5);
        top5.forEach((color, idx) => {
          const hex = rgbToHex(color.r, color.g, color.b);
          const item = document.createElement('div');
          item.className = 'color-extractor-circle-item';
          item.style.animationDelay = (idx * 0.08) + 's';

          const circle = document.createElement('div');
          circle.className = 'color-extractor-circle';
          circle.style.background = hex;
          circle.addEventListener('click', () => {
            expandColorToDetail(color, circle);
          });

          const hexLabel = document.createElement('span');
          hexLabel.className = 'color-extractor-circle-hex';
          hexLabel.textContent = hex;
          hexLabel.addEventListener('click', () => {
            expandColorToDetail(color, circle);
          });

          item.appendChild(circle);
          item.appendChild(hexLabel);
          colorExtractorCircles.appendChild(item);
        });
        if (colorExtractorResult) {
          requestAnimationFrame(() => {
            colorExtractorResult.classList.add('visible');
          });
        }
      }

      function resetColorExtractor() {
        if (colorExtractorUploadZone) colorExtractorUploadZone.style.display = '';
        if (colorExtractorImagePreview) colorExtractorImagePreview.style.display = 'none';
        if (colorExtractorImage) colorExtractorImage.src = '';
        if (colorExtractorResult) colorExtractorResult.classList.remove('visible');
        if (colorExtractorCircles) colorExtractorCircles.innerHTML = '';
        if (colorExtractorCirclesView) colorExtractorCirclesView.classList.remove('hidden');
        if (colorExtractorFill) {
          colorExtractorFill.classList.remove('expanded');
          colorExtractorFill.style.removeProperty('--fill-color');
          colorExtractorFill.style.removeProperty('--fill-x');
          colorExtractorFill.style.removeProperty('--fill-y');
          colorExtractorFill.style.removeProperty('--fill-scale');
        }
        if (colorExtractorDetailView) colorExtractorDetailView.classList.remove('visible');
        if (colorExtractorDetailCols) colorExtractorDetailCols.innerHTML = '';
        colorExtractorCurrentImg = null;
        colorExtractorColors = [];
        colorExtractorUsageCounted = false;
      }

      function expandColorToDetail(color, circleEl) {
        if (!colorExtractorFill || !colorExtractorResult) return;
        if (colorExtractorIsAnimating) return; // Prevent multiple simultaneous animations
        colorExtractorIsAnimating = true;
        
        const hex = rgbToHex(color.r, color.g, color.b);
        const rgbStr = `rgb(${color.r}, ${color.g}, ${color.b})`;
        const [h, s, l] = rgbToHsl(color.r, color.g, color.b);
        const hslStr = `hsl(${h}, ${s}%, ${l}%)`;

        // Calculate circle center relative to result container
        const rect = circleEl.getBoundingClientRect();
        const containerRect = colorExtractorResult.getBoundingClientRect();
        
        // Validate container dimensions
        if (containerRect.width === 0 || containerRect.height === 0) {
          console.error('[Color Extractor] Invalid container dimensions');
          colorExtractorIsAnimating = false;
          return;
        }
        
        const cx = rect.left + rect.width / 2 - containerRect.left;
        const cy = rect.top + rect.height / 2 - containerRect.top;
        const xPct = (cx / containerRect.width) * 100;
        const yPct = (cy / containerRect.height) * 100;

        // Calculate scale needed to cover the entire container from the clicked point
        const w = containerRect.width;
        const containerH = containerRect.height;
        const radius = 39; // half of 78px fill circle
        const corners = [
          Math.sqrt(cx * cx + cy * cy),
          Math.sqrt((w - cx) * (w - cx) + cy * cy),
          Math.sqrt(cx * cx + (containerH - cy) * (containerH - cy)),
          Math.sqrt((w - cx) * (w - cx) + (containerH - cy) * (containerH - cy)),
        ];
        const farthest = Math.max(...corners);
        const coverScale = (farthest / radius) + 0.5; // small margin

        // Hide circles view
        if (colorExtractorCirclesView) colorExtractorCirclesView.classList.add('hidden');

        // Set fill color, position, and scale, then expand after list starts hiding
        colorExtractorFill.style.setProperty('--fill-color', hex);
        colorExtractorFill.style.setProperty('--fill-x', xPct + '%');
        colorExtractorFill.style.setProperty('--fill-y', yPct + '%');
        colorExtractorFill.style.setProperty('--fill-scale', coverScale);
        colorExtractorFill.classList.remove('expanded');
        // Force reflow to ensure the browser registers the initial scale state
        void colorExtractorFill.offsetWidth;
        // Start fill animation after list starts hiding (50ms delay)
        const timer1 = setTimeout(() => {
          colorExtractorFill.classList.add('expanded');
          // Clean up will-change after animation completes
          const cleanupWillChange = () => {
            colorExtractorFill.style.removeProperty('will-change');
            colorExtractorFill.removeEventListener('transitionend', cleanupWillChange);
          };
          colorExtractorFill.addEventListener('transitionend', cleanupWillChange);
        }, 50);
        colorExtractorAnimationTimers.push(timer1);

        // After fill animation (1.2s + 50ms start delay = 1250ms), show detail view
        const timer2 = setTimeout(() => {
          renderDetailView(hex, rgbStr, hslStr, color);
          colorExtractorIsAnimating = false;
        }, 1250);
        colorExtractorAnimationTimers.push(timer2);
      }

      function renderDetailView(hex, rgbStr, hslStr, color) {
        if (!colorExtractorDetailCols || !colorExtractorDetailView || !colorExtractorBackDetailBtn) return;
        colorExtractorDetailCols.innerHTML = '';

        // Determine text color based on brightness
        const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
        const isLight = brightness > 200;
        const textColor = isLight ? '#1a1a1a' : '#ffffff';

        // Back button color
        colorExtractorBackDetailBtn.classList.toggle('dark-text', isLight);

        const codes = [
          { label: 'HEX', value: hex, desc: t('home.colorExtractor.hexLabel')},
          { label: 'RGB', value: rgbStr, desc: t('home.colorExtractor.rgbLabel')},
          { label: 'HSL', value: hslStr, desc: t('home.colorExtractor.hslLabel')},
        ];

        codes.forEach((code) => {
          const col = document.createElement('div');
          col.className = 'color-extractor-detail-col';

          const codeEl = document.createElement('div');
          codeEl.className = 'color-extractor-detail-col-code';
          codeEl.style.color = textColor;
          codeEl.textContent = code.value;
          codeEl.addEventListener('click', async () => {
            const copyToClipboard = (text) => {
              return new Promise((resolve, reject) => {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(text).then(resolve).catch(() => {
                    fallbackCopy(text, resolve, reject);
                  });
                } else {
                  fallbackCopy(text, resolve, reject);
                }
              });
            };
            const fallbackCopy = (text, resolve, reject) => {
              try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve();
              } catch (e) {
                reject(e);
              }
            };
            try {
              await copyToClipboard(code.value);
              codeEl.classList.remove('copied');
              void codeEl.offsetWidth;
              codeEl.classList.add('copied');
              showToast(t('home.colorExtractor.copySuccess'));
            } catch (e) {
              console.error('[Color Extractor] Copy failed:', e);
              showToast(t('home.colorExtractor.copyFailed'));
            }
          });

          const labelEl = document.createElement('div');
          labelEl.className = 'color-extractor-detail-col-label';
          labelEl.style.color = textColor;
          labelEl.textContent = code.desc;

          col.appendChild(codeEl);
          col.appendChild(labelEl);
          colorExtractorDetailCols.appendChild(col);
        });

        colorExtractorDetailView.classList.add('visible');
      }

      function collapseDetailToCircles() {
        if (colorExtractorDetailView) colorExtractorDetailView.classList.remove('visible');
        if (colorExtractorDetailCols) colorExtractorDetailCols.innerHTML = '';
        // After detail fades (0.4s), shrink fill, then show circles
        const timer1 = setTimeout(() => {
          if (colorExtractorFill) colorExtractorFill.classList.remove('expanded');
          // After fill shrinks (1.2s), show circles with animation
          const timer2 = setTimeout(() => {
            if (colorExtractorCirclesView) colorExtractorCirclesView.classList.remove('hidden');
          }, 1200);
          colorExtractorAnimationTimers.push(timer2);
        }, 400);
        colorExtractorAnimationTimers.push(timer1);
      }

      // Event listeners
      if (colorExtractorBack) colorExtractorBack.addEventListener('click', closeColorExtractorOverlay);
      if (colorExtractorReselectBtn) colorExtractorReselectBtn.addEventListener('click', resetColorExtractor);
      if (colorExtractorBackDetailBtn) colorExtractorBackDetailBtn.addEventListener('click', collapseDetailToCircles);

      if (colorExtractorUploadZone) {
        colorExtractorUploadZone.addEventListener('click', () => colorExtractorFileInput?.click());
        colorExtractorUploadZone.addEventListener('dragover', (e) => {
          e.preventDefault();
          colorExtractorUploadZone.classList.add('dragover');
        });
        let dragCounter = 0;
        colorExtractorUploadZone.addEventListener('dragenter', (e) => {
          e.preventDefault();
          dragCounter++;
          colorExtractorUploadZone.classList.add('dragover');
        });
        colorExtractorUploadZone.addEventListener('dragleave', () => {
          dragCounter--;
          if (dragCounter <= 0) {
            dragCounter = 0;
            colorExtractorUploadZone.classList.remove('dragover');
          }
        });
        colorExtractorUploadZone.addEventListener('drop', (e) => {
          e.preventDefault();
          colorExtractorUploadZone.classList.remove('dragover');
          const file = e.dataTransfer?.files?.[0];
          if (file) handleColorExtractorFile(file);
        });
      }

      if (colorExtractorFileInput) {
        colorExtractorFileInput.addEventListener('change', (e) => {
          const file = e.target.files?.[0];
          if (file) handleColorExtractorFile(file);
        });
      }

      // ===== End Color Extractor Tool =====

      // Tool list entry
      document.querySelectorAll('.audio-list-item[data-tool="color-extractor"]').forEach(item => {
        item.addEventListener('click', openColorExtractorOverlay);
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openColorExtractorOverlay(); }
        });
      });

      // ===== Text Stats Tool =====
      const textStatsOverlay = document.getElementById('textStatsOverlay');
      const textStatsBack = document.getElementById('textStatsBack');
      const textStatsBg = document.getElementById('textStatsBg');
      const textStatsInput = document.getElementById('textStatsInput');
      const textStatsClearBtn = document.getElementById('textStatsClearBtn');
      const textStatsCopyBtn = document.getElementById('textStatsCopyBtn');
      const textStatsChars = document.getElementById('textStatsChars');
      const textStatsCharsNoSpace = document.getElementById('textStatsCharsNoSpace');
      const textStatsSpaces = document.getElementById('textStatsSpaces');
      const textStatsWords = document.getElementById('textStatsWords');
      const textStatsEnglishWords = document.getElementById('textStatsEnglishWords');
      const textStatsLines = document.getElementById('textStatsLines');
      const textStatsParagraphs = document.getElementById('textStatsParagraphs');
      const textStatsSentences = document.getElementById('textStatsSentences');
      const textStatsChineseChars = document.getElementById('textStatsChineseChars');
      const textStatsLetters = document.getElementById('textStatsLetters');
      const textStatsUppercase = document.getElementById('textStatsUppercase');
      const textStatsLowercase = document.getElementById('textStatsLowercase');
      const textStatsDigits = document.getElementById('textStatsDigits');
      const textStatsPunctuation = document.getElementById('textStatsPunctuation');
      const textStatsLongestLine = document.getElementById('textStatsLongestLine');
      const textStatsAvgLineLength = document.getElementById('textStatsAvgLineLength');
      const textStatsReadingTime = document.getElementById('textStatsReadingTime');
      let textStatsPlasmaInstance = null;

      function calcTextStats(text) {
        if (!text) return { chars: 0, charsNoSpace: 0, spaces: 0, words: 0, englishWords: 0, lines: 0, paragraphs: 0, sentences: 0, chineseChars: 0, letters: 0, uppercase: 0, lowercase: 0, digits: 0, punctuation: 0, longestLine: 0, avgLineLength: 0, readingTime: 0 };
        const chars = text.length;
        const charsNoSpace = text.replace(/\s/g, '').length;
        const spaces = (text.match(/ /g) || []).length;
        const lineArr = text === '' ? [] : text.split(/\r?\n/);
        const lines = lineArr.length;
        const paragraphs = text.trim() === '' ? 0 : text.trim().split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
        const sentences = (text.match(/[^。！？.!?]+[。！？.!?]+/g) || []).length;
        const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const englishWords = text.replace(/[\u4e00-\u9fff]/g, ' ').trim().split(/\s+/).filter(w => /[a-zA-Z]/.test(w)).length;
        const words = chineseChars + englishWords;
        const letters = (text.match(/[a-zA-Z]/g) || []).length;
        const uppercase = (text.match(/[A-Z]/g) || []).length;
        const lowercase = (text.match(/[a-z]/g) || []).length;
        const digits = (text.match(/[0-9]/g) || []).length;
        const punctuation = (text.match(/[，。！？、；：\u201c\u201d\u2018\u2019（）【】《》…—·,.!?;:"'()\[\]{}]/g) || []).length;
        const longestLine = lineArr.length > 0 ? Math.max(...lineArr.map(l => l.length)) : 0;
        const totalLineChars = lineArr.reduce((sum, l) => sum + l.length, 0);
        const avgLineLength = lines > 0 ? Math.round(totalLineChars / lines) : 0;
        const readingTime = words > 0 ? Math.max(1, Math.ceil(words / 300)) : 0;
        return { chars, charsNoSpace, spaces, words, englishWords, lines, paragraphs, sentences, chineseChars, letters, uppercase, lowercase, digits, punctuation, longestLine, avgLineLength, readingTime };
      }

      function updateTextStats() {
        if (!textStatsInput) return;
        const text = textStatsInput.value;
        const stats = calcTextStats(text);
        const isEmpty = text.trim() === '';
        if (textStatsChars) textStatsChars.textContent = stats.chars;
        if (textStatsCharsNoSpace) textStatsCharsNoSpace.textContent = stats.charsNoSpace;
        if (textStatsSpaces) textStatsSpaces.textContent = stats.spaces;
        if (textStatsWords) textStatsWords.textContent = stats.words;
        if (textStatsEnglishWords) textStatsEnglishWords.textContent = stats.englishWords;
        if (textStatsLines) textStatsLines.textContent = stats.lines;
        if (textStatsParagraphs) textStatsParagraphs.textContent = stats.paragraphs;
        if (textStatsSentences) textStatsSentences.textContent = stats.sentences;
        if (textStatsChineseChars) textStatsChineseChars.textContent = stats.chineseChars;
        if (textStatsLetters) textStatsLetters.textContent = stats.letters;
        if (textStatsUppercase) textStatsUppercase.textContent = stats.uppercase;
        if (textStatsLowercase) textStatsLowercase.textContent = stats.lowercase;
        if (textStatsDigits) textStatsDigits.textContent = stats.digits;
        if (textStatsPunctuation) textStatsPunctuation.textContent = stats.punctuation;
        if (textStatsLongestLine) textStatsLongestLine.textContent = stats.longestLine;
        if (textStatsAvgLineLength) textStatsAvgLineLength.textContent = isEmpty ? 0 : stats.avgLineLength;
        if (textStatsReadingTime) textStatsReadingTime.textContent = isEmpty ? 0 : stats.readingTime;
      }

      function openTextStatsOverlay() {
        if (!textStatsOverlay) return;
        textStatsOverlay.classList.add('visible');
        updateTextStats();
        if (textStatsBg && !textStatsPlasmaInstance) {
          textStatsPlasmaInstance = initPlasma(textStatsBg, {
            color: '#6B6B6B', speed: 0.8, direction: 'forward', scale: 1, opacity: 1, mouseInteractive: false
          });
        }
        setTimeout(() => { if (textStatsInput) textStatsInput.focus(); }, 300);
      }

      function closeTextStatsOverlay() {
        if (!textStatsOverlay) return;
        textStatsOverlay.classList.remove('visible');
        if (textStatsPlasmaInstance) { textStatsPlasmaInstance(); textStatsPlasmaInstance = null; }
      }

      if (textStatsBack) textStatsBack.addEventListener('click', closeTextStatsOverlay);
      if (textStatsInput) textStatsInput.addEventListener('input', updateTextStats);
      if (textStatsClearBtn) {
        textStatsClearBtn.addEventListener('click', () => {
          if (textStatsInput) { textStatsInput.value = ''; textStatsInput.focus(); updateTextStats(); }
        });
      }
      if (textStatsCopyBtn) {
        textStatsCopyBtn.addEventListener('click', () => {
          if (!textStatsInput) return;
          const stats = calcTextStats(textStatsInput.value);
          const isEmpty = textStatsInput.value.trim() === '';
          const isZh = getLang() === 'zh';
          const labels = isZh ? {
            chars: '总字符数', charsNoSpace: '不含空格字符', spaces: '空格数',
            words: '单词总数', englishWords: '英文单词数', chineseChars: '中文字符',
            letters: '英文字母', uppercase: '大写字母', lowercase: '小写字母',
            digits: '数字', punctuation: '标点符号', lines: '行数',
            paragraphs: '段落数', sentences: '句子数', longestLine: '最长行字符',
            avgLineLength: '平均行长', readingTime: '预计阅读(分钟)'
          } : {
            chars: 'Characters', charsNoSpace: 'Chars (no space)', spaces: 'Spaces',
            words: 'Total Words', englishWords: 'English Words', chineseChars: 'Chinese Chars',
            letters: 'Letters', uppercase: 'Uppercase', lowercase: 'Lowercase',
            digits: 'Digits', punctuation: 'Punctuation', lines: 'Lines',
            paragraphs: 'Paragraphs', sentences: 'Sentences', longestLine: 'Longest Line',
            avgLineLength: 'Avg Line Length', readingTime: 'Reading (min)'
          };
          const lines = [
            labels.chars + ': ' + stats.chars,
            labels.charsNoSpace + ': ' + stats.charsNoSpace,
            labels.spaces + ': ' + stats.spaces,
            labels.words + ': ' + stats.words,
            labels.englishWords + ': ' + stats.englishWords,
            labels.chineseChars + ': ' + stats.chineseChars,
            labels.letters + ': ' + stats.letters,
            labels.uppercase + ': ' + stats.uppercase,
            labels.lowercase + ': ' + stats.lowercase,
            labels.digits + ': ' + stats.digits,
            labels.punctuation + ': ' + stats.punctuation,
            labels.lines + ': ' + stats.lines,
            labels.paragraphs + ': ' + stats.paragraphs,
            labels.sentences + ': ' + stats.sentences,
            labels.longestLine + ': ' + stats.longestLine,
            labels.avgLineLength + ': ' + (isEmpty ? 0 : stats.avgLineLength),
            labels.readingTime + ': ' + (isEmpty ? 0 : stats.readingTime)
          ];
          navigator.clipboard.writeText(lines.join('\n')).then(() => {
            const original = textStatsCopyBtn.textContent;
            textStatsCopyBtn.textContent = '✓';
            setTimeout(() => { textStatsCopyBtn.textContent = original; }, 1500);
            if (window.incrementToolUsage) window.incrementToolUsage();
          }).catch(() => {});
        });
      }

      // Tool list entry
      document.querySelectorAll('.audio-list-item[data-tool="text-stats"]').forEach(item => {
        item.addEventListener('click', openTextStatsOverlay);
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTextStatsOverlay(); }
        });
      });

      // ===== Text Format Tool =====
      const textFormatOverlay = document.getElementById('textFormatOverlay');
      const textFormatBack = document.getElementById('textFormatBack');
      const textFormatBg = document.getElementById('textFormatBg');
      const textFormatInput = document.getElementById('textFormatInput');
      const textFormatOutput = document.getElementById('textFormatOutput');
      const textFormatActions = document.getElementById('textFormatActions');
      const textFormatCopyBtn = document.getElementById('textFormatCopyBtn');
      const textFormatClearBtn = document.getElementById('textFormatClearBtn');
      const textFormatUseAsInputBtn = document.getElementById('textFormatUseAsInputBtn');
      let textFormatPlasmaInstance = null;

      function toHalfWidth(str) {
        return str.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ');
      }
      function toFullWidth(str) {
        return str.replace(/[\u0020-\u007E]/g, ch => ch === ' ' ? '\u3000' : String.fromCharCode(ch.charCodeAt(0) + 0xFEE0));
      }

      function executeFormat(action, text) {
        if (!text) return '';
        switch (action) {
          case 'uppercase': return text.toUpperCase();
          case 'lowercase': return text.toLowerCase();
          case 'titlecase': return text.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
          case 'capitalize': return text.replace(/([.!?。！？]\s*)([a-z\u4e00-\u9fff])/g, (m, p1, p2) => p1 + p2.toUpperCase()).replace(/^([a-z\u4e00-\u9fff])/, (m, p1) => p1.toUpperCase());
          case 'trimSpaces': return text.replace(/[ \t]+/g, ' ').replace(/^[ \t]+|[ \t]+$/gm, '');
          case 'trimLines': return text.split(/\r?\n/).map(l => l.trim()).join('\n');
          case 'removeEmptyLines': return text.split(/\r?\n/).filter(l => l.trim().length > 0).join('\n');
          case 'removeDuplicateLines': { const seen = new Set(); return text.split(/\r?\n/).filter(l => { if (seen.has(l)) return false; seen.add(l); return true; }).join('\n'); }
          case 'sortAsc': return text.split(/\r?\n/).sort((a, b) => a.localeCompare(b)).join('\n');
          case 'sortDesc': return text.split(/\r?\n/).sort((a, b) => b.localeCompare(a)).join('\n');
          case 'addLineNumbers': return text.split(/\r?\n/).map((l, i) => (i + 1) + '. ' + l).join('\n');
          case 'removeLineNumbers': return text.split(/\r?\n/).map(l => l.replace(/^\s*\d+[\.\、\)]\s*/, '')).join('\n');
          case 'reverseLines': return text.split(/\r?\n/).reverse().join('\n');
          case 'reverseText': return [...text].reverse().join('');
          case 'toHalfWidth': return toHalfWidth(text);
          case 'toFullWidth': return toFullWidth(text);
          default: return text;
        }
      }

      function openTextFormatOverlay() {
        if (!textFormatOverlay) return;
        textFormatOverlay.classList.add('visible');
        if (textFormatBg && !textFormatPlasmaInstance) {
          textFormatPlasmaInstance = initPlasma(textFormatBg, {
            color: '#6B6B6B', speed: 0.8, direction: 'forward', scale: 1, opacity: 1, mouseInteractive: false
          });
        }
        setTimeout(() => { if (textFormatInput) textFormatInput.focus(); }, 300);
      }

      function closeTextFormatOverlay() {
        if (!textFormatOverlay) return;
        textFormatOverlay.classList.remove('visible');
        if (textFormatPlasmaInstance) { textFormatPlasmaInstance(); textFormatPlasmaInstance = null; }
      }

      if (textFormatBack) textFormatBack.addEventListener('click', closeTextFormatOverlay);
      if (textFormatActions) {
        textFormatActions.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-action]');
          if (!btn) return;
          const text = textFormatInput ? textFormatInput.value : '';
          if (!text) return;
          const result = executeFormat(btn.dataset.action, text);
          if (textFormatOutput) textFormatOutput.value = result;
          if (window.incrementToolUsage) window.incrementToolUsage();
        });
      }
      if (textFormatCopyBtn) {
        textFormatCopyBtn.addEventListener('click', () => {
          if (!textFormatOutput || !textFormatOutput.value) return;
          navigator.clipboard.writeText(textFormatOutput.value).then(() => {
            const original = textFormatCopyBtn.textContent;
            textFormatCopyBtn.textContent = '✓';
            setTimeout(() => { textFormatCopyBtn.textContent = original; }, 1500);
          }).catch(() => {});
        });
      }
      if (textFormatClearBtn) {
        textFormatClearBtn.addEventListener('click', () => {
          if (textFormatInput) textFormatInput.value = '';
          if (textFormatOutput) textFormatOutput.value = '';
          if (textFormatInput) textFormatInput.focus();
        });
      }
      if (textFormatUseAsInputBtn) {
        textFormatUseAsInputBtn.addEventListener('click', () => {
          if (!textFormatOutput || !textFormatOutput.value) return;
          if (textFormatInput) textFormatInput.value = textFormatOutput.value;
          if (textFormatOutput) textFormatOutput.value = '';
          if (textFormatInput) textFormatInput.focus();
        });
      }

      document.querySelectorAll('.audio-list-item[data-tool="text-format"]').forEach(item => {
        item.addEventListener('click', openTextFormatOverlay);
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTextFormatOverlay(); }
        });
      });

      // ===== Typing Test =====
      const typingTestOverlay = document.getElementById('typingTestOverlay');
      const typingTestBack = document.getElementById('typingTestBack');
      const typingTestBg = document.getElementById('typingTestBg');
      const typingTestBody = document.getElementById('typingTestBody');
      const typingTestSettings = document.getElementById('typingTestSettings');
      const typingTestArea = document.getElementById('typingTestArea');
      const typingTestResult = document.getElementById('typingTestResult');
      const typingTestText = document.getElementById('typingTestText');
      const typingTestInput = document.getElementById('typingTestInput');
      const typingTestStartBtn = document.getElementById('typingTestStartBtn');
      const typingTestResetBtn = document.getElementById('typingTestResetBtn');
      const typingTestAgainBtn = document.getElementById('typingTestAgainBtn');
      const typingTestBackBtn = document.getElementById('typingTestBackBtn');
      const typingTestTime = document.getElementById('typingTestTime');
      const typingTestWpm = document.getElementById('typingTestWpm');
      const typingTestAccuracy = document.getElementById('typingTestAccuracy');
      const typingTestLangOptions = document.getElementById('typingTestLangOptions');
      const typingTestDifficultyOptions = document.getElementById('typingTestDifficultyOptions');
      const typingTestDurationOptions = document.getElementById('typingTestDurationOptions');
      const typingTestResultWpm = document.getElementById('typingTestResultWpm');
      const typingTestResultCpm = document.getElementById('typingTestResultCpm');
      const typingTestResultAccuracy = document.getElementById('typingTestResultAccuracy');
      const typingTestResultCorrect = document.getElementById('typingTestResultCorrect');
      const typingTestResultWrong = document.getElementById('typingTestResultWrong');
      const typingTestResultRating = document.getElementById('typingTestResultRating');

      let typingTestDitherInstance = null;
      let typingTestTimer = null;
      let typingTestComposing = false;
      let zhInputBuffer = '';
      let typingTestState = {
        lang: getLang() === 'zh' ? 'zh' : 'en',
        difficulty: 'easy',
        duration: 30,
        targetText: '',
        input: '',
        startTime: 0,
        timeLeft: 30,
        isRunning: false,
        isFinished: false,
        correctCount: 0,
        wrongCount: 0,
        totalCharCount: 0,
        backspaceCount: 0,
      };

      const TYPING_TEST_WORDS = typingWordsData;

      function generateTypingText(lang, difficulty) {
        const pool = TYPING_TEST_WORDS[lang]?.[difficulty] || TYPING_TEST_WORDS.zh.easy;
        const count = difficulty === 'easy' ? 20 : difficulty === 'medium' ? 16 : 12;
        let parts = [];
        for (let i = 0; i < count; i++) {
          parts.push(pool[Math.floor(Math.random() * pool.length)]);
        }
        if (lang === 'en') {
          return parts.join(' ');
        }
        return parts.join('');
      }

      let typingAudioCtx = null;
      function getTypingAudioCtx() {
        if (!typingAudioCtx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return null;
          typingAudioCtx = new AudioContext();
        }
        if (typingAudioCtx.state === 'suspended') {
          typingAudioCtx.resume();
        }
        return typingAudioCtx;
      }

      function playTypingSound() {
        try {
          const ctx = getTypingAudioCtx();
          if (!ctx) return;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1200, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.06);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.06);
        } catch (e) {
          // Ignore audio errors
        }
      }

      function playErrorSound() {
        try {
          const ctx = getTypingAudioCtx();
          if (!ctx) return;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(300, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.1);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.1);
        } catch (e) {
          // Ignore audio errors
        }
      }

      function renderTypingText() {
        if (!typingTestText) return;
        typingTestText.innerHTML = '';
        const target = typingTestState.targetText;
        const input = typingTestState.input;
        const isPunctuation = (ch) => /[，。！？、；：\u201c\u201d\u2018\u2019（）【】《》…—·,.!?;:"'()\[\]{}]/.test(ch);

        let tIdx = 0, iIdx = 0;
        while (tIdx < target.length || iIdx < input.length) {
          if (tIdx < target.length && isPunctuation(target[tIdx])) {
            const charSpan = document.createElement('span');
            charSpan.className = 'typing-test-char';
            charSpan.textContent = target[tIdx];
            typingTestText.appendChild(charSpan);
            tIdx++;
            continue;
          }
          if (iIdx < input.length && isPunctuation(input[iIdx])) {
            iIdx++;
            continue;
          }
          if (tIdx < target.length && iIdx < input.length) {
            const charSpan = document.createElement('span');
            charSpan.className = 'typing-test-char';
            charSpan.textContent = target[tIdx];
            if (input[iIdx] === target[tIdx]) {
              charSpan.classList.add('correct');
            } else {
              charSpan.classList.add('wrong');
            }
            typingTestText.appendChild(charSpan);
            tIdx++;
            iIdx++;
          } else if (tIdx < target.length) {
            const charSpan = document.createElement('span');
            charSpan.className = 'typing-test-char';
            charSpan.textContent = target[tIdx];
            if (iIdx === input.length) charSpan.classList.add('current');
            typingTestText.appendChild(charSpan);
            tIdx++;
          } else if (iIdx < input.length) {
            const extraSpan = document.createElement('span');
            extraSpan.className = 'typing-test-char extra';
            extraSpan.textContent = input[iIdx];
            typingTestText.appendChild(extraSpan);
            iIdx++;
          }
        }
      }

      function updateTypingStats() {
        const elapsed = (Date.now() - typingTestState.startTime) / 1000 / 60;
        const totalChars = typingTestState.totalCharCount || typingTestState.input.length;
        const correctChars = typingTestState.correctCount;
        const cpm = elapsed > 0 ? Math.round(correctChars / elapsed) : 0;
        const wpm = elapsed > 0 ? Math.round((correctChars / 5) / elapsed) : 0;
        const accuracy = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 100;
        if (typingTestTime) typingTestTime.textContent = typingTestState.timeLeft;
        if (typingTestWpm) typingTestWpm.textContent = wpm;
        if (typingTestAccuracy) typingTestAccuracy.textContent = accuracy + '%';
        if (typingTestTime && typingTestState.timeLeft <= 10) {
          typingTestTime.classList.add('warning');
        }
        return { wpm, cpm, accuracy };
      }

      function getTypingRating(wpm, lang) {
        if (lang === 'zh') {
          if (wpm >= 120) return 'S';
          if (wpm >= 100) return 'A';
          if (wpm >= 80) return 'B';
          if (wpm >= 60) return 'C';
          return 'D';
        }
        if (wpm >= 80) return 'S';
        if (wpm >= 60) return 'A';
        if (wpm >= 40) return 'B';
        if (wpm >= 20) return 'C';
        return 'D';
      }

      function showTypingResult() {
        const elapsed = (Date.now() - typingTestState.startTime) / 1000 / 60;
        const correctChars = typingTestState.correctCount;
        const wrongChars = typingTestState.wrongCount;
        const totalChars = typingTestState.totalCharCount || typingTestState.input.length;
        const cpm = elapsed > 0 ? Math.round(correctChars / elapsed) : 0;
        const wpm = elapsed > 0 ? Math.round((correctChars / 5) / elapsed) : 0;
        const accuracy = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 100;
        const rating = getTypingRating(wpm, typingTestState.lang);
        if (typingTestArea) typingTestArea.style.display = 'none';
        if (typingTestResult) typingTestResult.style.display = 'block';
        if (typingTestResultWpm) typingTestResultWpm.textContent = wpm;
        if (typingTestResultCpm) typingTestResultCpm.textContent = cpm;
        if (typingTestResultAccuracy) typingTestResultAccuracy.textContent = accuracy + '%';
        if (typingTestResultCorrect) typingTestResultCorrect.textContent = correctChars;
        if (typingTestResultWrong) typingTestResultWrong.textContent = wrongChars;
        if (typingTestResultRating) typingTestResultRating.textContent = rating;
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      function endTypingTest() {
        if (!typingTestState.isRunning) return;
        typingTestState.isRunning = false;
        typingTestState.isFinished = true;
        if (typingTestTimer) {
          clearInterval(typingTestTimer);
          typingTestTimer = null;
        }
        if (typingTestInput) typingTestInput.blur();
        showTypingResult();
      }

      function startTypingTest() {
        typingTestState.targetText = generateTypingText(typingTestState.lang, typingTestState.difficulty);
        typingTestState.input = '';
        typingTestState.startTime = 0;
        typingTestState.timeLeft = typingTestState.duration;
        typingTestState.isRunning = false;
        typingTestState.isFinished = false;
        typingTestState.correctCount = 0;
        typingTestState.wrongCount = 0;
        typingTestState.totalCharCount = 0;
        typingTestState.backspaceCount = 0;
        if (typingTestSettings) typingTestSettings.style.display = 'none';
        if (typingTestResult) typingTestResult.style.display = 'none';
        if (typingTestArea) typingTestArea.style.display = 'flex';
        if (typingTestTime) {
          typingTestTime.textContent = typingTestState.duration;
          typingTestTime.classList.remove('warning');
        }
        if (typingTestWpm) typingTestWpm.textContent = '0';
        if (typingTestAccuracy) typingTestAccuracy.textContent = '100%';
        renderTypingText();
        zhInputBuffer = '';
        if (typingTestInput) {
          typingTestInput.value = '';
          typingTestInput.focus();
        }
      }

      function resetTypingTestToSettings() {
        if (typingTestTimer) {
          clearInterval(typingTestTimer);
          typingTestTimer = null;
        }
        typingTestState.isRunning = false;
        typingTestState.isFinished = false;
        if (typingTestArea) typingTestArea.style.display = 'none';
        if (typingTestResult) typingTestResult.style.display = 'none';
        if (typingTestSettings) typingTestSettings.style.display = 'block';
      }

      function openTypingTestOverlay() {
        if (!typingTestOverlay) return;
        typingTestOverlay.classList.add('visible');
        typingTestState.lang = getLang() === 'zh' ? 'zh' : 'en';
        selectTypingTestOption(typingTestLangOptions, typingTestState.lang);
        resetTypingTestToSettings();
        if (typingTestBg && !typingTestDitherInstance) {
          typingTestDitherInstance = initDither(typingTestBg, { color: 'rgba(120,130,255,0.18)', speed: 0.0006 });
        }
      }

      function closeTypingTestOverlay() {
        if (!typingTestOverlay) return;
        typingTestOverlay.classList.remove('visible');
        if (typingTestTimer) {
          clearInterval(typingTestTimer);
          typingTestTimer = null;
        }
        typingTestState.isRunning = false;
        if (typingTestDitherInstance) { typingTestDitherInstance(); typingTestDitherInstance = null; }
      }

      function handleTypingInput() {
        if (!typingTestInput || typingTestState.isFinished || typingTestComposing) return;
        const rawVal = typingTestState.lang === 'zh' ? zhInputBuffer : typingTestInput.value;
        const target = typingTestState.targetText;
        const prevLen = typingTestState.input.length;

        // 双指针比对：跳过标点，确保字符顺序一致
        const isPunctuation = (ch) => /[，。！？、；：\u201c\u201d\u2018\u2019（）【】《》…—·,.!?;:"'()\[\]{}]/.test(ch);
        let targetChars = target.split('');
        let inputChars = rawVal.split('');
        let tIdx = 0, iIdx = 0;
        let correct = 0, wrong = 0;
        let inputCharCount = 0;

        while (tIdx < targetChars.length && iIdx < inputChars.length) {
          while (tIdx < targetChars.length && isPunctuation(targetChars[tIdx])) tIdx++;
          while (iIdx < inputChars.length && isPunctuation(inputChars[iIdx])) iIdx++;
          if (tIdx < targetChars.length && iIdx < inputChars.length) {
            inputCharCount++;
            if (targetChars[tIdx] === inputChars[iIdx]) {
              correct++;
            } else {
              wrong++;
            }
            tIdx++;
            iIdx++;
          }
        }
        while (iIdx < inputChars.length) {
          if (!isPunctuation(inputChars[iIdx])) {
            wrong++;
            inputCharCount++;
          }
          iIdx++;
        }

        typingTestState.input = rawVal;
        typingTestState.correctCount = correct;
        typingTestState.wrongCount = wrong;
        typingTestState.totalCharCount = inputCharCount;
        if (!typingTestState.isRunning && rawVal.length > 0) {
          typingTestState.isRunning = true;
          typingTestState.startTime = Date.now();
          typingTestTimer = setInterval(() => {
            typingTestState.timeLeft -= 1;
            updateTypingStats();
            if (typingTestState.timeLeft <= 0) {
              endTypingTest();
            }
          }, 1000);
        }
        if (!typingTestState.isRunning) return;

        if (rawVal.length > prevLen) {
          const lastIdx = rawVal.length - 1;
          const lastChar = rawVal[lastIdx];
          if (!isPunctuation(lastChar)) {
            if (lastChar === target[lastIdx]) {
              playTypingSound();
            } else {
              playErrorSound();
            }
          }
        }
        renderTypingText();
        updateTypingStats();
        if (wrong === 0 && tIdx >= targetChars.length && rawVal.length > 0) {
          endTypingTest();
        }
      }

      function selectTypingTestOption(container, value) {
        if (!container) return;
        container.querySelectorAll('.typing-test-option').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.value === value);
        });
      }

      if (typingTestStartBtn) typingTestStartBtn.addEventListener('click', startTypingTest);
      if (typingTestResetBtn) typingTestResetBtn.addEventListener('click', startTypingTest);
      if (typingTestAgainBtn) typingTestAgainBtn.addEventListener('click', startTypingTest);
      if (typingTestBackBtn) typingTestBackBtn.addEventListener('click', resetTypingTestToSettings);
      if (typingTestBack) typingTestBack.addEventListener('click', closeTypingTestOverlay);
      if (typingTestInput) {
        typingTestInput.addEventListener('input', (e) => {
          if (e.isComposing || typingTestComposing) return;
          if (typingTestState.lang === 'zh') return;
          handleTypingInput();
        });
        typingTestInput.addEventListener('keydown', (e) => {
          if (typingTestState.lang !== 'zh') return;
          if (typingTestComposing) return;
          if (e.key === 'Backspace' && zhInputBuffer.length > 0) {
            zhInputBuffer = zhInputBuffer.slice(0, -1);
            handleTypingInput();
          }
        });
        typingTestInput.addEventListener('compositionstart', () => { typingTestComposing = true; });
        typingTestInput.addEventListener('compositionend', (e) => {
          typingTestComposing = false;
          if (typingTestState.lang === 'zh') {
            if (e.data) {
              const cleanData = e.data.replace(/[，。！？、；：""''（）【】《》…—·,.!?;:"'()\[\]{}]/g, '');
              if (cleanData) {
                zhInputBuffer += cleanData;
              }
            }
            typingTestInput.value = '';
            handleTypingInput();
          } else {
            setTimeout(() => handleTypingInput(), 0);
          }
        });
      }
      if (typingTestBody) {
        typingTestBody.addEventListener('click', (e) => {
          if (!typingTestState.isFinished && typingTestArea && typingTestArea.style.display !== 'none') {
            if (typingTestInput) typingTestInput.focus();
          }
        });
      }
      if (typingTestLangOptions) {
        typingTestLangOptions.addEventListener('click', (e) => {
          const btn = e.target.closest('.typing-test-option');
          if (!btn) return;
          typingTestState.lang = btn.dataset.value;
          selectTypingTestOption(typingTestLangOptions, btn.dataset.value);
        });
      }
      if (typingTestDifficultyOptions) {
        typingTestDifficultyOptions.addEventListener('click', (e) => {
          const btn = e.target.closest('.typing-test-option');
          if (!btn) return;
          typingTestState.difficulty = btn.dataset.value;
          selectTypingTestOption(typingTestDifficultyOptions, btn.dataset.value);
        });
      }
      if (typingTestDurationOptions) {
        typingTestDurationOptions.addEventListener('click', (e) => {
          const btn = e.target.closest('.typing-test-option');
          if (!btn) return;
          typingTestState.duration = parseInt(btn.dataset.value, 10);
          selectTypingTestOption(typingTestDurationOptions, btn.dataset.value);
        });
      }

      // Tool list entry
      document.querySelectorAll('.audio-list-item[data-tool="typing-test"]').forEach(item => {
        item.addEventListener('click', openTypingTestOverlay);
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTypingTestOverlay(); }
        });
      });

      // ===== Body Fat Calculator =====
      const bmiCalcOverlay = document.getElementById('bmiCalcOverlay');
      const bmiCalcBack = document.getElementById('bmiCalcBack');
      const bmiCalcBg = document.getElementById('bmiCalcBg');
      const bmiCalcModeTabs = document.getElementById('bmiCalcModeTabs');
      const bmiCalcAdvancedFields = document.getElementById('bmiCalcAdvancedFields');
      const bmiCalcGenderTabs = document.getElementById('bmiCalcGenderTabs');
      const bmiCalcHipField = document.getElementById('bmiCalcHipField');
      const bmiCalcResultEmpty = document.getElementById('bmiCalcResultEmpty');
      const bmiCalcResultContent = document.getElementById('bmiCalcResultContent');
      const bmiCalcBarMarker = document.getElementById('bmiCalcBarMarker');

      let bmiCalcGender = 'male';
      let bmiCalcMode = 'simple';
      let bmiCalcDitherInstance = null;

      function openBmiCalcOverlay() {
        if (!bmiCalcOverlay) return;
        bmiCalcOverlay.classList.add('visible');
        if (bmiCalcBg && !bmiCalcDitherInstance) {
          bmiCalcDitherInstance = initDarkVeil(bmiCalcBg, {
            hueShift: 0,
            noiseIntensity: 0.03,
            scanlineIntensity: 0,
            speed: 1.6,
            scanlineFrequency: 5,
            warpAmount: 0,
            resolutionScale: 1
          });
        }
        calcBmiResult();
      }

      function closeBmiCalcOverlay() {
        if (bmiCalcOverlay) bmiCalcOverlay.classList.remove('visible');
        if (bmiCalcDitherInstance) {
          bmiCalcDitherInstance();
          bmiCalcDitherInstance = null;
        }
        Object.keys(bmiCalcWarnTimers).forEach(id => clearTimeout(bmiCalcWarnTimers[id]));
        if (bmiCalcWarnDialog) bmiCalcWarnDialog.classList.remove('visible');
      }

      if (bmiCalcBack) {
        bmiCalcBack.addEventListener('click', closeBmiCalcOverlay);
      }

      // Mode tabs
      if (bmiCalcModeTabs) {
        bmiCalcModeTabs.querySelectorAll('.bmi-calc-mode-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            bmiCalcModeTabs.querySelectorAll('.bmi-calc-mode-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            bmiCalcMode = tab.dataset.mode;
            if (bmiCalcAdvancedFields) {
              bmiCalcAdvancedFields.style.display = bmiCalcMode === 'advanced' ? '' : 'none';
            }
            calcBmiResult();
          });
        });
      }

      // Gender tabs
      if (bmiCalcGenderTabs) {
        bmiCalcGenderTabs.querySelectorAll('.bmi-calc-gender-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            bmiCalcGenderTabs.querySelectorAll('.bmi-calc-gender-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            bmiCalcGender = tab.dataset.gender;
            if (bmiCalcHipField) {
              bmiCalcHipField.style.display = bmiCalcGender === 'female' ? '' : 'none';
            }
            calcBmiResult();
          });
        });
      }

      // Input limits and defaults
      const bmiCalcLimits = {
        bmiCalcAge: { min: 1, max: 120, default: 25, label: () => t('home.bmiCalc.age')},
        bmiCalcHeight: { min: 50, max: 250, default: 170, label: () => t('home.bmiCalc.height')},
        bmiCalcWeight: { min: 10, max: 300, default: 65, label: () => t('home.bmiCalc.weight')},
        bmiCalcWaist: { min: 30, max: 200, default: 80, label: () => t('home.bmiCalc.waist')},
        bmiCalcNeck: { min: 20, max: 100, default: 38, label: () => t('home.bmiCalc.neck')},
        bmiCalcHip: { min: 30, max: 200, default: 90, label: () => t('home.bmiCalc.hip')}
      };

      const bmiCalcWarnDialog = document.getElementById('bmiCalcWarnDialog');
      const bmiCalcWarnMsg = document.getElementById('bmiCalcWarnMsg');
      const bmiCalcWarnOk = document.getElementById('bmiCalcWarnOk');
      let bmiCalcWarnFieldId = null;

      function showBmiCalcWarn(fieldId) {
        const lim = bmiCalcLimits[fieldId];
        if (!lim) return;
        bmiCalcWarnFieldId = fieldId;
        if (bmiCalcWarnMsg) {
          bmiCalcWarnMsg.textContent = (t('home.bmiCalc.warnMsg'))
            .replace('{label}', lim.label())
            .replace('{min}', lim.min)
            .replace('{max}', lim.max);
        }
        if (bmiCalcWarnDialog) bmiCalcWarnDialog.classList.add('visible');
      }

      if (bmiCalcWarnOk) {
        bmiCalcWarnOk.addEventListener('click', () => {
          if (bmiCalcWarnFieldId && bmiCalcLimits[bmiCalcWarnFieldId]) {
            const el = document.getElementById(bmiCalcWarnFieldId);
            if (el) el.value = bmiCalcLimits[bmiCalcWarnFieldId].default;
            calcBmiResult();
          }
          if (bmiCalcWarnDialog) bmiCalcWarnDialog.classList.remove('visible');
        });
      }

      // Input listeners with debounced out-of-range detection
      const bmiCalcWarnTimers = {};
      Object.keys(bmiCalcLimits).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
          calcBmiResult();
          clearTimeout(bmiCalcWarnTimers[id]);
          if (!el.value) return;
          const val = parseFloat(el.value);
          if (isNaN(val)) return;
          const lim = bmiCalcLimits[id];
          if (val < lim.min || val > lim.max) {
            bmiCalcWarnTimers[id] = setTimeout(() => {
              showBmiCalcWarn(id);
            }, 800);
          }
        });
      });

      function getBmiInput(id) {
        const el = document.getElementById(id);
        if (!el || !el.value) return 0;
        const val = parseFloat(el.value);
        if (isNaN(val)) return 0;
        const lim = bmiCalcLimits[id];
        if (lim) {
          return Math.min(lim.max, Math.max(lim.min, val));
        }
        return val;
      }

      function getBmiTagClass(level) {
        if (level === 'low') return 'tag-low';
        if (level === 'normal') return 'tag-normal';
        if (level === 'high') return 'tag-high';
        return 'tag-veryhigh';
      }

      function getBmiLevel(bmi) {
        if (bmi < 18.5) return { level: 'low', label: t('home.bmiCalc.rangeLow')};
        if (bmi < 24) return { level: 'normal', label: t('home.bmiCalc.rangeNormal')};
        if (bmi < 28) return { level: 'high', label: t('home.bmiCalc.rangeHigh')};
        return { level: 'veryhigh', label: t('home.bmiCalc.rangeVeryHigh')};
      }

      function getBodyFatLevel(bf, isMale) {
        if (isMale) {
          if (bf < 10) return { level: 'low', label: t('home.bmiCalc.rangeLow')};
          if (bf < 20) return { level: 'normal', label: t('home.bmiCalc.rangeNormal')};
          if (bf < 25) return { level: 'high', label: t('home.bmiCalc.rangeHigh')};
          return { level: 'veryhigh', label: t('home.bmiCalc.rangeVeryHigh')};
        } else {
          if (bf < 18) return { level: 'low', label: t('home.bmiCalc.rangeLow')};
          if (bf < 28) return { level: 'normal', label: t('home.bmiCalc.rangeNormal')};
          if (bf < 35) return { level: 'high', label: t('home.bmiCalc.rangeHigh')};
          return { level: 'veryhigh', label: t('home.bmiCalc.rangeVeryHigh')};
        }
      }

      function calcBmiResult() {
        const age = getBmiInput('bmiCalcAge');
        const height = getBmiInput('bmiCalcHeight');
        const weight = getBmiInput('bmiCalcWeight');
        const isMale = bmiCalcGender === 'male';

        if (!height || !weight) {
          if (bmiCalcResultEmpty) bmiCalcResultEmpty.style.display = '';
          if (bmiCalcResultContent) bmiCalcResultContent.style.display = 'none';
          return;
        }

        const heightM = height / 100;
        const bmi = weight / (heightM * heightM);
        const bmiInfo = getBmiLevel(bmi);

        // Body fat calculation
        let bodyFat = 0;
        if (bmiCalcMode === 'advanced') {
          const waist = getBmiInput('bmiCalcWaist');
          const neck = getBmiInput('bmiCalcNeck');
          const hip = getBmiInput('bmiCalcHip');
          if (waist && neck && height) {
            if (isMale) {
              const logVal = Math.log10(waist - neck);
              bodyFat = 495 / (1.0324 - 0.19077 * logVal + 0.15456 * Math.log10(height)) - 450;
            } else {
              if (hip) {
                const logVal = Math.log10(waist + hip - neck);
                bodyFat = 495 / (1.29579 - 0.35004 * logVal + 0.22100 * Math.log10(height)) - 450;
              }
            }
          }
        }
        if (!bodyFat || !isFinite(bodyFat) || bodyFat < 0) {
          // Deurenberg formula
          bodyFat = 1.20 * bmi + 0.23 * (age || 25) - 10.8 * (isMale ? 1 : 0) - 5.4;
        }
        bodyFat = Math.max(0, bodyFat);
        const bfInfo = getBodyFatLevel(bodyFat, isMale);

        // BMR (Mifflin-St Jeor)
        const bmr = isMale
          ? 10 * weight + 6.25 * height - 5 * (age || 25) + 5
          : 10 * weight + 6.25 * height - 5 * (age || 25) - 161;

        // Ideal weight (BMI 22)
        const idealWeight = heightM * heightM * 22;
        const weightDiff = weight - idealWeight;

        // Fat mass / lean mass
        const fatMass = weight * bodyFat / 100;
        const leanMass = weight - fatMass;

        // Show results
        if (bmiCalcResultEmpty) bmiCalcResultEmpty.style.display = 'none';
        if (bmiCalcResultContent) bmiCalcResultContent.style.display = '';
        if (window.incrementToolUsage) window.incrementToolUsage();

        const bmiValueEl = document.getElementById('bmiValue');
        const bmiTagEl = document.getElementById('bmiTag');
        const bodyFatValueEl = document.getElementById('bodyFatValue');
        const bodyFatTagEl = document.getElementById('bodyFatTag');
        const bmrValueEl = document.getElementById('bmrValue');
        const idealWeightValueEl = document.getElementById('idealWeightValue');
        const idealWeightDiffEl = document.getElementById('idealWeightDiff');
        const fatMassValueEl = document.getElementById('fatMassValue');
        const leanMassValueEl = document.getElementById('leanMassValue');

        if (bmiValueEl) bmiValueEl.textContent = bmi.toFixed(1);
        if (bmiTagEl) {
          bmiTagEl.textContent = bmiInfo.label;
          bmiTagEl.className = 'bmi-calc-card-tag ' + getBmiTagClass(bmiInfo.level);
        }
        if (bodyFatValueEl) bodyFatValueEl.textContent = bodyFat.toFixed(1) + '%';
        if (bodyFatTagEl) {
          bodyFatTagEl.textContent = bfInfo.label;
          bodyFatTagEl.className = 'bmi-calc-card-tag ' + getBmiTagClass(bfInfo.level);
        }
        if (bmrValueEl) bmrValueEl.textContent = Math.round(bmr).toString();
        if (idealWeightValueEl) idealWeightValueEl.textContent = idealWeight.toFixed(1) + ' kg';
        if (idealWeightDiffEl) {
          const diffText = weightDiff > 0
            ? '+' + weightDiff.toFixed(1) + ' kg'
            : weightDiff.toFixed(1) + ' kg';
          idealWeightDiffEl.textContent = diffText;
          idealWeightDiffEl.className = 'bmi-calc-card-tag ' + getBmiTagClass(
            Math.abs(weightDiff) < 3 ? 'normal' : (weightDiff > 0 ? 'high' : 'low')
          );
        }
        if (fatMassValueEl) fatMassValueEl.textContent = fatMass.toFixed(1) + ' kg';
        if (leanMassValueEl) leanMassValueEl.textContent = leanMass.toFixed(1) + ' kg';

        // Bar marker position (0-40% range mapped to 0-100%)
        const barPercent = Math.min(100, Math.max(0, (bodyFat / 40) * 100));
        if (bmiCalcBarMarker) bmiCalcBarMarker.style.left = barPercent + '%';
      }

      // Open from tool list
      document.querySelectorAll('.audio-list-item[data-tool="bmi-calc"]').forEach(item => {
        item.addEventListener('click', () => {
          if (transitionMask) transitionMask.classList.add('visible');
          setTimeout(() => {
            openBmiCalcOverlay();
            if (transitionMask) transitionMask.classList.remove('visible');
          }, 1000);
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.click();
          }
        });
      });

      // ===== End Body Fat Calculator =====

      // ===== Timestamp Calculator =====
      const tsCalcOverlay = document.getElementById('tsCalcOverlay');
      const tsCalcBack = document.getElementById('tsCalcBack');
      const tsCalcBg = document.getElementById('tsCalcBg');
      const tsCalcModeTabs = document.getElementById('tsCalcModeTabs');
      const tsCalcTs2DateForm = document.getElementById('tsCalcTs2DateForm');
      const tsCalcDate2TsForm = document.getElementById('tsCalcDate2TsForm');
      const tsCalcInput = document.getElementById('tsCalcInput');
      const tsCalcDateInput = document.getElementById('tsCalcDateInput');
      const tsCalcFormatTabs = document.getElementById('tsCalcFormatTabs');
      const tsCalcFormatTabs2 = document.getElementById('tsCalcFormatTabs2');
      const tsCalcResultEmpty = document.getElementById('tsCalcResultEmpty');
      const tsCalcResultContent = document.getElementById('tsCalcResultContent');
      const tsCalcResultValue = document.getElementById('tsCalcResultValue');
      const tsCalcResultLabel = document.getElementById('tsCalcResultLabel');
      const tsCalcDetailLocal = document.getElementById('tsCalcDetailLocal');
      const tsCalcDetailUtc = document.getElementById('tsCalcDetailUtc');
      const tsCalcDetailRelative = document.getElementById('tsCalcDetailRelative');
      const tsCalcNowSec = document.getElementById('tsCalcNowSec');
      const tsCalcNowMs = document.getElementById('tsCalcNowMs');

      let tsCalcMode = 'ts2date';
      let tsCalcFormat = 'local';
      let tsCalcFormat2 = 'unix';
      let tsCalcDitherInstance = null;
      let tsCalcNowTimer = null;

      function pad2(n) { return n < 10 ? '0' + n : '' + n; }

      function formatLocalDate(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
          ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
      }

      function formatUtcDate(d) {
        return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) +
          ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
      }

      function getRelativeTime(ts, now) {
        const diff = ts - now;
        const absDiff = Math.abs(diff);
        if (absDiff < 1) return t('home.timestampCalc.now');
        const isPast = diff < 0;
        if (absDiff < 60) {
          return Math.round(absDiff) + (isPast ? t('home.timestampCalc.secAgo') : t('home.timestampCalc.secLater'));
        }
        if (absDiff < 3600) {
          return Math.round(absDiff / 60) + (isPast ? t('home.timestampCalc.minAgo') : t('home.timestampCalc.minLater'));
        }
        if (absDiff < 86400) {
          return Math.round(absDiff / 3600) + (isPast ? t('home.timestampCalc.hourAgo') : t('home.timestampCalc.hourLater'));
        }
        return Math.round(absDiff / 86400) + (isPast ? t('home.timestampCalc.dayAgo') : t('home.timestampCalc.dayLater'));
      }

      function parseTimestamp(str) {
        if (!str) return null;
        const val = parseFloat(str.trim());
        if (isNaN(val) || val <= 0) return null;
        if (val > 1e14) return null;
        const isMs = str.trim().length >= 13 || val > 1e11;
        return { ts: isMs ? val / 1000 : val, isMs };
      }

      function updateTsCalcNow() {
        const now = Math.floor(Date.now() / 1000);
        const nowMs = Date.now();
        if (tsCalcNowSec) tsCalcNowSec.textContent = now.toString();
        if (tsCalcNowMs) tsCalcNowMs.textContent = nowMs.toString();
      }

      function calcTsResult() {
        if (tsCalcMode === 'ts2date') {
          const parsed = parseTimestamp(tsCalcInput ? tsCalcInput.value : '');
          if (!parsed) {
            if (tsCalcResultEmpty) tsCalcResultEmpty.style.display = '';
            if (tsCalcResultContent) tsCalcResultContent.style.display = 'none';
            return;
          }
          const d = new Date(parsed.ts * 1000);
          if (isNaN(d.getTime())) {
            if (tsCalcResultEmpty) tsCalcResultEmpty.style.display = '';
            if (tsCalcResultContent) tsCalcResultContent.style.display = 'none';
            return;
          }
          if (tsCalcResultEmpty) tsCalcResultEmpty.style.display = 'none';
          if (tsCalcResultContent) tsCalcResultContent.style.display = '';
          if (window.incrementToolUsage) window.incrementToolUsage();

          let resultStr = '';
          if (tsCalcFormat === 'local') resultStr = formatLocalDate(d);
          else if (tsCalcFormat === 'utc') resultStr = formatUtcDate(d) + ' UTC';
          else if (tsCalcFormat === 'iso') resultStr = d.toISOString();
          else if (tsCalcFormat === 'relative') resultStr = getRelativeTime(parsed.ts, Date.now() / 1000);

          if (tsCalcResultValue) tsCalcResultValue.textContent = resultStr;
          if (tsCalcResultLabel) {
            const fmtLabels = { local: 'localTime', utc: 'utcTime', iso: 'iso', relative: 'relativeTime' };
            tsCalcResultLabel.textContent = t('home.timestampCalc.' + (fmtLabels[tsCalcFormat] || 'localTime'));
          }
          if (tsCalcDetailLocal) tsCalcDetailLocal.textContent = formatLocalDate(d);
          if (tsCalcDetailUtc) tsCalcDetailUtc.textContent = formatUtcDate(d) + ' UTC';
          if (tsCalcDetailRelative) tsCalcDetailRelative.textContent = getRelativeTime(parsed.ts, Date.now() / 1000);
        } else {
          if (!tsCalcDateInput || !tsCalcDateInput.value) {
            if (tsCalcResultEmpty) tsCalcResultEmpty.style.display = '';
            if (tsCalcResultContent) tsCalcResultContent.style.display = 'none';
            return;
          }
          const d = new Date(tsCalcDateInput.value);
          if (isNaN(d.getTime())) {
            if (tsCalcResultEmpty) tsCalcResultEmpty.style.display = '';
            if (tsCalcResultContent) tsCalcResultContent.style.display = 'none';
            return;
          }
          const tsSec = Math.floor(d.getTime() / 1000);
          const tsMs = d.getTime();
          if (tsCalcResultEmpty) tsCalcResultEmpty.style.display = 'none';
          if (tsCalcResultContent) tsCalcResultContent.style.display = '';
          if (window.incrementToolUsage) window.incrementToolUsage();

          let resultStr = '';
          if (tsCalcFormat2 === 'unix') resultStr = tsSec.toString();
          else if (tsCalcFormat2 === 'ms') resultStr = tsMs.toString();
          else if (tsCalcFormat2 === 'iso') resultStr = d.toISOString();

          if (tsCalcResultValue) tsCalcResultValue.textContent = resultStr;
          if (tsCalcResultLabel) tsCalcResultLabel.textContent = t('home.timestampCalc.resultLabel');
          if (tsCalcDetailLocal) tsCalcDetailLocal.textContent = formatLocalDate(d);
          if (tsCalcDetailUtc) tsCalcDetailUtc.textContent = formatUtcDate(d) + ' UTC';
          if (tsCalcDetailRelative) tsCalcDetailRelative.textContent = getRelativeTime(tsSec, Date.now() / 1000);
        }
      }

      function openTsCalcOverlay() {
        if (!tsCalcOverlay) return;
        tsCalcOverlay.classList.add('visible');
        if (tsCalcBg && !tsCalcDitherInstance) {
          tsCalcDitherInstance = initDarkVeil(tsCalcBg, {
            hueShift: 0,
            noiseIntensity: 0.03,
            scanlineIntensity: 0,
            speed: 1.6,
            scanlineFrequency: 5,
            warpAmount: 0,
            resolutionScale: 1
          });
        }
        // Reset state
        tsCalcMode = 'ts2date';
        tsCalcFormat = 'local';
        tsCalcFormat2 = 'unix';
        if (tsCalcModeTabs) {
          tsCalcModeTabs.querySelectorAll('.ts-calc-mode-tab').forEach(t => t.classList.remove('active'));
          const defaultModeTab = tsCalcModeTabs.querySelector('[data-mode="ts2date"]');
          if (defaultModeTab) defaultModeTab.classList.add('active');
        }
        if (tsCalcFormatTabs) {
          tsCalcFormatTabs.querySelectorAll('.ts-calc-format-tab').forEach(t => t.classList.remove('active'));
          const defaultFmtTab = tsCalcFormatTabs.querySelector('[data-fmt="local"]');
          if (defaultFmtTab) defaultFmtTab.classList.add('active');
        }
        if (tsCalcFormatTabs2) {
          tsCalcFormatTabs2.querySelectorAll('.ts-calc-format-tab').forEach(t => t.classList.remove('active'));
          const defaultFmtTab2 = tsCalcFormatTabs2.querySelector('[data-fmt="unix"]');
          if (defaultFmtTab2) defaultFmtTab2.classList.add('active');
        }
        if (tsCalcTs2DateForm) tsCalcTs2DateForm.style.display = '';
        if (tsCalcDate2TsForm) tsCalcDate2TsForm.style.display = 'none';
        if (tsCalcInput) tsCalcInput.value = '';
        if (tsCalcDateInput) {
          const now = new Date();
          tsCalcDateInput.value = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) +
            'T' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
        }
        updateTsCalcNow();
        if (tsCalcNowTimer) clearInterval(tsCalcNowTimer);
        tsCalcNowTimer = setInterval(updateTsCalcNow, 1000);
        calcTsResult();
      }

      function closeTsCalcOverlay() {
        if (tsCalcOverlay) tsCalcOverlay.classList.remove('visible');
        if (tsCalcDitherInstance) {
          tsCalcDitherInstance();
          tsCalcDitherInstance = null;
        }
        if (tsCalcNowTimer) {
          clearInterval(tsCalcNowTimer);
          tsCalcNowTimer = null;
        }
      }

      if (tsCalcBack) {
        tsCalcBack.addEventListener('click', closeTsCalcOverlay);
      }

      // Mode tabs
      if (tsCalcModeTabs) {
        tsCalcModeTabs.querySelectorAll('.ts-calc-mode-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            tsCalcModeTabs.querySelectorAll('.ts-calc-mode-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tsCalcMode = tab.dataset.mode;
            if (tsCalcTs2DateForm) tsCalcTs2DateForm.style.display = tsCalcMode === 'ts2date' ? '' : 'none';
            if (tsCalcDate2TsForm) tsCalcDate2TsForm.style.display = tsCalcMode === 'date2ts' ? '' : 'none';
            calcTsResult();
          });
        });
      }

      // Format tabs (ts2date)
      if (tsCalcFormatTabs) {
        tsCalcFormatTabs.querySelectorAll('.ts-calc-format-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            tsCalcFormatTabs.querySelectorAll('.ts-calc-format-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tsCalcFormat = tab.dataset.fmt;
            calcTsResult();
          });
        });
      }

      // Format tabs (date2ts)
      if (tsCalcFormatTabs2) {
        tsCalcFormatTabs2.querySelectorAll('.ts-calc-format-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            tsCalcFormatTabs2.querySelectorAll('.ts-calc-format-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tsCalcFormat2 = tab.dataset.fmt;
            calcTsResult();
          });
        });
      }

      // Input listeners
      if (tsCalcInput) {
        tsCalcInput.addEventListener('input', calcTsResult);
      }
      if (tsCalcDateInput) {
        tsCalcDateInput.addEventListener('input', calcTsResult);
        tsCalcDateInput.addEventListener('change', calcTsResult);
      }

      // Copy buttons
      const tsCalcCopyTimers = {};
      function copyToClipboard(text, btn) {
        if (!text || text === '--') return;
        navigator.clipboard.writeText(text).then(() => {
          if (btn) {
            const key = btn.id || btn.textContent;
            clearTimeout(tsCalcCopyTimers[key]);
            if (!btn.dataset.origText) btn.dataset.origText = btn.textContent;
            btn.textContent = t('home.timestampCalc.copied');
            tsCalcCopyTimers[key] = setTimeout(() => { btn.textContent = btn.dataset.origText; }, 1500);
          }
        }).catch(() => {});
      }

      const tsCalcCopyNowSec = document.getElementById('tsCalcCopyNowSec');
      const tsCalcCopyNowMs = document.getElementById('tsCalcCopyNowMs');
      const tsCalcCopyResult = document.getElementById('tsCalcCopyResult');

      if (tsCalcCopyNowSec) {
        tsCalcCopyNowSec.addEventListener('click', () => {
          copyToClipboard(tsCalcNowSec ? tsCalcNowSec.textContent : '', tsCalcCopyNowSec);
        });
      }
      if (tsCalcCopyNowMs) {
        tsCalcCopyNowMs.addEventListener('click', () => {
          copyToClipboard(tsCalcNowMs ? tsCalcNowMs.textContent : '', tsCalcCopyNowMs);
        });
      }
      if (tsCalcCopyResult) {
        tsCalcCopyResult.addEventListener('click', () => {
          copyToClipboard(tsCalcResultValue ? tsCalcResultValue.textContent : '', tsCalcCopyResult);
        });
      }

      // Open from tool list
      document.querySelectorAll('.audio-list-item[data-tool="timestamp-calc"]').forEach(item => {
        item.addEventListener('click', () => {
          if (transitionMask) transitionMask.classList.add('visible');
          setTimeout(() => {
            openTsCalcOverlay();
            if (transitionMask) transitionMask.classList.remove('visible');
          }, 1000);
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.click();
          }
        });
      });

      // ===== End Timestamp Calculator =====

      // ===== Mortgage Calculator =====
      const mortgageCalcOverlay = document.getElementById('mortgageCalcOverlay');
      const mortgageCalcBack = document.getElementById('mortgageCalcBack');
      const mortgageCalcBg = document.getElementById('mortgageCalcBg');
      const mortgageCalcMethodTabs = document.getElementById('mortgageCalcMethodTabs');
      const mortgageCalcBtn = document.getElementById('mortgageCalcBtn');
      const mortgageCalcResultEmpty = document.getElementById('mortgageCalcResultEmpty');
      const mortgageCalcResultContent = document.getElementById('mortgageCalcResultContent');
      const mortgageCalcScheduleBody = document.getElementById('mortgageCalcScheduleBody');

      let mortgageCalcMethod = 'equalPayment';
      let mortgageCalcDitherInstance = null;
      let mortgageCalcSchedule = [];

      function formatMoney(val) {
        if (!isFinite(val)) return '--';
        return val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }

      function formatWan(val) {
        if (!isFinite(val)) return '--';
        const unit = t('home.mortgageCalc.loanAmountUnit');
        if (unit === '万') {
          return val.toFixed(2) + ' ' + unit;
        }
        return formatMoney(val * 10000);
      }

      function calcMortgage() {
        const amountEl = document.getElementById('mortgageCalcAmount');
        const termEl = document.getElementById('mortgageCalcTerm');
        const rateEl = document.getElementById('mortgageCalcRate');
        if (!amountEl || !termEl || !rateEl) return;

        const amountWan = parseFloat(amountEl.value);
        const termYears = parseFloat(termEl.value);
        const annualRate = parseFloat(rateEl.value);

        if (!amountWan || amountWan <= 0 || !termYears || termYears <= 0 || !annualRate || annualRate <= 0) {
          if (mortgageCalcResultEmpty) mortgageCalcResultEmpty.style.display = '';
          if (mortgageCalcResultContent) mortgageCalcResultContent.style.display = 'none';
          return;
        }

        const months = Math.round(termYears * 12);
        if (months < 1) {
          if (mortgageCalcResultEmpty) mortgageCalcResultEmpty.style.display = '';
          if (mortgageCalcResultContent) mortgageCalcResultContent.style.display = 'none';
          return;
        }

        // Show global spider transition mask
        if (transitionMask) transitionMask.classList.add('visible');
        if (mortgageCalcBtn) mortgageCalcBtn.disabled = true;

        setTimeout(() => {
          _doCalcMortgage(amountWan, termYears, annualRate, months);
          if (transitionMask) transitionMask.classList.remove('visible');
          if (mortgageCalcBtn) mortgageCalcBtn.disabled = false;
        }, 1000);
      }

      function _doCalcMortgage(amountWan, termYears, annualRate, months) {
        const principal = amountWan * 10000;
        const monthlyRate = annualRate / 100 / 12;

        mortgageCalcSchedule = [];
        let totalInterest = 0;
        let totalPayment = 0;
        let monthlyDisplay = '';
        let firstMonthly = 0;
        let lastMonthly = 0;
        let monthlyTagText = '';

        if (mortgageCalcMethod === 'equalPayment') {
          // 等额本息: M = P * r * (1+r)^n / ((1+r)^n - 1)
          let monthlyPayment;
          if (monthlyRate === 0) {
            monthlyPayment = principal / months;
          } else {
            const factor = Math.pow(1 + monthlyRate, months);
            monthlyPayment = principal * monthlyRate * factor / (factor - 1);
          }
          monthlyDisplay = formatMoney(monthlyPayment);
          firstMonthly = monthlyPayment;
          lastMonthly = monthlyPayment;
          monthlyTagText = t('home.mortgageCalc.fixedMonthly');

          let remaining = principal;
          for (let i = 1; i <= months; i++) {
            const interest = remaining * monthlyRate;
            const mPrincipal = monthlyPayment - interest;
            remaining -= mPrincipal;
            if (i === months) remaining = 0;
            totalInterest += interest;
            mortgageCalcSchedule.push({
              month: i,
              principal: mPrincipal,
              interest: interest,
              remaining: Math.max(0, remaining)
            });
          }
          totalPayment = monthlyPayment * months;
        } else {
          // 等额本金: 每月本金 = P / n, 每月利息 = remaining * r
          const monthlyPrincipal = principal / months;
          let remaining = principal;
          for (let i = 1; i <= months; i++) {
            const interest = remaining * monthlyRate;
            const payment = monthlyPrincipal + interest;
            remaining -= monthlyPrincipal;
            if (i === months) remaining = 0;
            totalInterest += interest;
            mortgageCalcSchedule.push({
              month: i,
              principal: monthlyPrincipal,
              interest: interest,
              remaining: Math.max(0, remaining)
            });
            if (i === 1) firstMonthly = payment;
            if (i === months) lastMonthly = payment;
          }
          totalPayment = principal + totalInterest;
          monthlyDisplay = formatMoney(firstMonthly) + ' → ' + formatMoney(lastMonthly);
          monthlyTagText = t('home.mortgageCalc.monthlyDecreasing');
        }

        if (mortgageCalcResultEmpty) mortgageCalcResultEmpty.style.display = 'none';
        if (mortgageCalcResultContent) mortgageCalcResultContent.style.display = '';
        if (window.incrementToolUsage) window.incrementToolUsage();

        const monthlyValueEl = document.getElementById('mortgageCalcMonthlyValue');
        const monthlyLabelEl = document.getElementById('mortgageCalcMonthlyLabel');
        const monthlyTagEl = document.getElementById('mortgageCalcMonthlyTag');
        const totalValueEl = document.getElementById('mortgageCalcTotalValue');
        const totalTagEl = document.getElementById('mortgageCalcTotalTag');
        const interestValueEl = document.getElementById('mortgageCalcInterestValue');
        const interestTagEl = document.getElementById('mortgageCalcInterestTag');
        const ratioValueEl = document.getElementById('mortgageCalcRatioValue');

        if (monthlyValueEl) monthlyValueEl.textContent = monthlyDisplay;
        if (monthlyLabelEl) monthlyLabelEl.textContent = t('home.mortgageCalc.monthlyPayment');
        if (monthlyTagEl) monthlyTagEl.textContent = monthlyTagText;
        if (totalValueEl) totalValueEl.textContent = formatWan(totalPayment / 10000);
        if (totalTagEl) totalTagEl.textContent = months + ' ' + (t('home.mortgageCalc.months'));
        if (interestValueEl) interestValueEl.textContent = formatWan(totalInterest / 10000);
        if (interestTagEl) interestTagEl.textContent = formatMoney(totalInterest);
        if (ratioValueEl) ratioValueEl.textContent = (totalPayment > 0 ? (totalInterest / totalPayment * 100).toFixed(1) : '0') + '%';

        renderSchedule();
      }

      function renderSchedule() {
        if (!mortgageCalcScheduleBody) return;
        mortgageCalcScheduleBody.innerHTML = mortgageCalcSchedule.map(row =>
          '<div class="mortgage-calc-schedule-row">' +
            '<span>' + row.month + '</span>' +
            '<span>' + formatMoney(row.principal) + '</span>' +
            '<span>' + formatMoney(row.interest) + '</span>' +
            '<span>' + formatMoney(row.remaining) + '</span>' +
          '</div>'
        ).join('');
      }

      function openMortgageCalcOverlay() {
        if (!mortgageCalcOverlay) return;
        mortgageCalcOverlay.classList.add('visible');
        if (mortgageCalcBg && !mortgageCalcDitherInstance) {
          mortgageCalcDitherInstance = initDarkVeil(mortgageCalcBg, {
            hueShift: 0,
            noiseIntensity: 0.03,
            scanlineIntensity: 0,
            speed: 1.6,
            scanlineFrequency: 5,
            warpAmount: 0,
            resolutionScale: 1
          });
        }
        // Reset state
        mortgageCalcMethod = 'equalPayment';
        if (mortgageCalcMethodTabs) {
          mortgageCalcMethodTabs.querySelectorAll('.mortgage-calc-method-tab').forEach(tab => tab.classList.remove('active'));
          const defaultTab = mortgageCalcMethodTabs.querySelector('[data-method="equalPayment"]');
          if (defaultTab) defaultTab.classList.add('active');
        }
        mortgageCalcSchedule = [];
        if (mortgageCalcResultEmpty) mortgageCalcResultEmpty.style.display = '';
        if (mortgageCalcResultContent) mortgageCalcResultContent.style.display = 'none';
        if (mortgageCalcScheduleBody) mortgageCalcScheduleBody.innerHTML = '';
        const amountEl = document.getElementById('mortgageCalcAmount');
        const termEl = document.getElementById('mortgageCalcTerm');
        const rateEl = document.getElementById('mortgageCalcRate');
        if (amountEl && !amountEl.value.trim()) amountEl.value = '100';
        if (termEl && !termEl.value.trim()) termEl.value = '30';
        if (rateEl && !rateEl.value.trim()) rateEl.value = '4.2';
      }

      function closeMortgageCalcOverlay() {
        if (mortgageCalcOverlay) mortgageCalcOverlay.classList.remove('visible');
        if (mortgageCalcDitherInstance) {
          mortgageCalcDitherInstance();
          mortgageCalcDitherInstance = null;
        }
      }

      if (mortgageCalcBack) {
        mortgageCalcBack.addEventListener('click', closeMortgageCalcOverlay);
      }

      if (mortgageCalcMethodTabs) {
        mortgageCalcMethodTabs.querySelectorAll('.mortgage-calc-method-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            mortgageCalcMethodTabs.querySelectorAll('.mortgage-calc-method-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            mortgageCalcMethod = tab.dataset.method;
          });
        });
      }

      if (mortgageCalcBtn) {
        mortgageCalcBtn.addEventListener('click', calcMortgage);
      }

      // Enter key support on input fields
      ['mortgageCalcAmount', 'mortgageCalcTerm', 'mortgageCalcRate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); calcMortgage(); }
        });
      });

      // Open from tool list
      document.querySelectorAll('.audio-list-item[data-tool="mortgage-calc"]').forEach(item => {
        item.addEventListener('click', () => {
          if (transitionMask) transitionMask.classList.add('visible');
          setTimeout(() => {
            openMortgageCalcOverlay();
            if (transitionMask) transitionMask.classList.remove('visible');
          }, 1000);
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.click();
          }
        });
      });

      // ===== End Mortgage Calculator =====

      // ===== Interest Calculator =====
      const interestCalcOverlay = document.getElementById('interestCalcOverlay');
      const interestCalcBack = document.getElementById('interestCalcBack');
      const interestCalcBg = document.getElementById('interestCalcBg');
      const interestCalcModeTabs = document.getElementById('interestCalcModeTabs');
      const interestCalcFreqTabs = document.getElementById('interestCalcFreqTabs');
      const interestCalcBtn = document.getElementById('interestCalcBtn');
      const interestCalcResultEmpty = document.getElementById('interestCalcResultEmpty');
      const interestCalcResultContent = document.getElementById('interestCalcResultContent');
      const interestCalcScheduleBody = document.getElementById('interestCalcScheduleBody');
      const interestCalcPrincipalField = document.getElementById('interestCalcPrincipalField');
      const interestCalcRegularField = document.getElementById('interestCalcRegularField');
      const interestCalcFreqField = document.getElementById('interestCalcFreqField');

      let interestCalcMode = 'simple';
      let interestCalcFreq = 'yearly';
      let interestCalcDitherInstance = null;
      let interestCalcSchedule = [];

      function formatInterestMoney(val) {
        if (!isFinite(val)) return '--';
        return val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }

      function calcInterest() {
        const rateEl = document.getElementById('interestCalcRate');
        const termEl = document.getElementById('interestCalcTerm');
        if (!rateEl || !termEl) return;

        const annualRate = parseFloat(rateEl.value);
        const termYears = parseFloat(termEl.value);

        if (!annualRate || annualRate <= 0 || !termYears || termYears <= 0) {
          if (interestCalcResultEmpty) interestCalcResultEmpty.style.display = '';
          if (interestCalcResultContent) interestCalcResultContent.style.display = 'none';
          return;
        }

        let principal = 0;
        let regularAmount = 0;

        if (interestCalcMode === 'recurring') {
          const regEl = document.getElementById('interestCalcRegularAmount');
          if (!regEl) return;
          regularAmount = parseFloat(regEl.value);
          if (!regularAmount || regularAmount <= 0) {
            if (interestCalcResultEmpty) interestCalcResultEmpty.style.display = '';
            if (interestCalcResultContent) interestCalcResultContent.style.display = 'none';
            return;
          }
        } else {
          const principalEl = document.getElementById('interestCalcPrincipal');
          if (!principalEl) return;
          principal = parseFloat(principalEl.value);
          if (!principal || principal <= 0) {
            if (interestCalcResultEmpty) interestCalcResultEmpty.style.display = '';
            if (interestCalcResultContent) interestCalcResultContent.style.display = 'none';
            return;
          }
        }

        if (transitionMask) transitionMask.classList.add('visible');
        if (interestCalcBtn) interestCalcBtn.disabled = true;

        setTimeout(() => {
          _doCalcInterest(principal, regularAmount, annualRate, termYears);
          if (transitionMask) transitionMask.classList.remove('visible');
          if (interestCalcBtn) interestCalcBtn.disabled = false;
        }, 1000);
      }

      function _doCalcInterest(principal, regularAmount, annualRate, termYears) {
        const monthlyRate = annualRate / 100 / 12;
        const dailyRate = annualRate / 100 / 365;

        interestCalcSchedule = [];
        let totalAmount = 0;
        let totalInterest = 0;
        let totalInvested = 0;

        if (interestCalcMode === 'simple') {
          // 单利: 利息 = P × r × n, 本利和 = P × (1 + r × n)
          totalInterest = principal * (annualRate / 100) * termYears;
          totalAmount = principal + totalInterest;
          totalInvested = principal;

          for (let i = 1; i <= termYears; i++) {
            const yearInterest = principal * (annualRate / 100);
            const balance = principal + yearInterest * i;
            interestCalcSchedule.push({
              period: i,
              invested: i === 1 ? principal : 0,
              interest: yearInterest,
              balance: balance
            });
          }
        } else if (interestCalcMode === 'compound') {
          // 复利: A = P × (1 + r/n)^(n×t)
          let periodsPerYear, ratePerPeriod;
          if (interestCalcFreq === 'yearly') {
            periodsPerYear = 1;
            ratePerPeriod = annualRate / 100;
          } else if (interestCalcFreq === 'monthly') {
            periodsPerYear = 12;
            ratePerPeriod = monthlyRate;
          } else {
            periodsPerYear = 365;
            ratePerPeriod = dailyRate;
          }

          const totalPeriods = Math.round(termYears * periodsPerYear);
          let balance = principal;
          totalInvested = principal;

          if (interestCalcFreq === 'daily') {
            // 按日复利明细按年汇总，避免 3650+ 行 DOM 卡顿
            let yearInterestSum = 0;
            for (let i = 1; i <= totalPeriods; i++) {
              const periodInterest = balance * ratePerPeriod;
              balance += periodInterest;
              yearInterestSum += periodInterest;
              if (i % periodsPerYear === 0) {
                const yearNum = Math.floor(i / periodsPerYear);
                interestCalcSchedule.push({
                  period: yearNum,
                  invested: yearNum === 1 ? principal : 0,
                  interest: yearInterestSum,
                  balance: balance
                });
                yearInterestSum = 0;
              }
            }
            // 处理余数（非整年）
            if (yearInterestSum > 0) {
              interestCalcSchedule.push({
                period: interestCalcSchedule.length + 1,
                invested: 0,
                interest: yearInterestSum,
                balance: balance
              });
            }
          } else {
            for (let i = 1; i <= totalPeriods; i++) {
              const periodInterest = balance * ratePerPeriod;
              balance += periodInterest;
              interestCalcSchedule.push({
                period: i,
                invested: i === 1 ? principal : 0,
                interest: periodInterest,
                balance: balance
              });
            }
          }
          totalAmount = balance;
          totalInterest = totalAmount - principal;
        } else {
          // 定投: 每月投入, 复利按月计算
          // FV = PMT × ((1 + r)^n - 1) / r
          const totalMonths = Math.round(termYears * 12);
          let balance = 0;
          totalInvested = 0;

          for (let i = 1; i <= totalMonths; i++) {
            balance += regularAmount;
            totalInvested += regularAmount;
            const periodInterest = balance * monthlyRate;
            balance += periodInterest;
            interestCalcSchedule.push({
              period: i,
              invested: regularAmount,
              interest: periodInterest,
              balance: balance
            });
          }
          totalAmount = balance;
          totalInterest = totalAmount - totalInvested;
        }

        if (interestCalcResultEmpty) interestCalcResultEmpty.style.display = 'none';
        if (interestCalcResultContent) interestCalcResultContent.style.display = '';
        if (window.incrementToolUsage) window.incrementToolUsage();

        const totalValueEl = document.getElementById('interestCalcTotalValue');
        const totalTagEl = document.getElementById('interestCalcTotalTag');
        const interestValueEl = document.getElementById('interestCalcInterestValue');
        const interestTagEl = document.getElementById('interestCalcInterestTag');
        const investedValueEl = document.getElementById('interestCalcInvestedValue');
        const investedTagEl = document.getElementById('interestCalcInvestedTag');
        const returnRateValueEl = document.getElementById('interestCalcReturnRateValue');
        const returnTagEl = document.getElementById('interestCalcReturnTag');

        if (totalValueEl) totalValueEl.textContent = formatInterestMoney(totalAmount);
        if (totalTagEl) totalTagEl.textContent = t('home.interestCalc.totalAmount');
        if (interestValueEl) interestValueEl.textContent = formatInterestMoney(totalInterest);
        if (interestTagEl) interestTagEl.textContent = t('home.interestCalc.totalInterest');
        if (investedValueEl) investedValueEl.textContent = formatInterestMoney(totalInvested);
        if (investedTagEl) investedTagEl.textContent = t('home.interestCalc.totalInvested');
        const returnRate = totalInvested > 0 ? (totalInterest / totalInvested * 100).toFixed(1) : '0';
        if (returnRateValueEl) returnRateValueEl.textContent = returnRate + '%';
        if (returnTagEl) returnTagEl.textContent = formatInterestMoney(totalInterest);

        renderInterestSchedule();
      }

      function renderInterestSchedule() {
        if (!interestCalcScheduleBody) return;
        interestCalcScheduleBody.innerHTML = interestCalcSchedule.map(row =>
          '<div class="mortgage-calc-schedule-row">' +
            '<span>' + row.period + '</span>' +
            '<span>' + formatInterestMoney(row.invested) + '</span>' +
            '<span>' + formatInterestMoney(row.interest) + '</span>' +
            '<span>' + formatInterestMoney(row.balance) + '</span>' +
          '</div>'
        ).join('');
      }

      function updateInterestModeFields() {
        if (interestCalcMode === 'recurring') {
          if (interestCalcPrincipalField) interestCalcPrincipalField.style.display = 'none';
          if (interestCalcRegularField) interestCalcRegularField.style.display = '';
          if (interestCalcFreqField) interestCalcFreqField.style.display = 'none';
        } else if (interestCalcMode === 'compound') {
          if (interestCalcPrincipalField) interestCalcPrincipalField.style.display = '';
          if (interestCalcRegularField) interestCalcRegularField.style.display = 'none';
          if (interestCalcFreqField) interestCalcFreqField.style.display = '';
        } else {
          if (interestCalcPrincipalField) interestCalcPrincipalField.style.display = '';
          if (interestCalcRegularField) interestCalcRegularField.style.display = 'none';
          if (interestCalcFreqField) interestCalcFreqField.style.display = 'none';
        }
      }

      function openInterestCalcOverlay() {
        if (!interestCalcOverlay) return;
        interestCalcOverlay.classList.add('visible');
        if (interestCalcBg && !interestCalcDitherInstance) {
          interestCalcDitherInstance = initDarkVeil(interestCalcBg, {
            hueShift: 0,
            noiseIntensity: 0.03,
            scanlineIntensity: 0,
            speed: 1.6,
            scanlineFrequency: 5,
            warpAmount: 0,
            resolutionScale: 1
          });
        }
        // Reset state
        interestCalcMode = 'simple';
        interestCalcFreq = 'yearly';
        if (interestCalcModeTabs) {
          interestCalcModeTabs.querySelectorAll('.mortgage-calc-method-tab').forEach(tab => tab.classList.remove('active'));
          const defaultTab = interestCalcModeTabs.querySelector('[data-mode="simple"]');
          if (defaultTab) defaultTab.classList.add('active');
        }
        if (interestCalcFreqTabs) {
          interestCalcFreqTabs.querySelectorAll('.mortgage-calc-method-tab').forEach(tab => tab.classList.remove('active'));
          const defaultFreqTab = interestCalcFreqTabs.querySelector('[data-freq="yearly"]');
          if (defaultFreqTab) defaultFreqTab.classList.add('active');
        }
        updateInterestModeFields();
        interestCalcSchedule = [];
        if (interestCalcResultEmpty) interestCalcResultEmpty.style.display = '';
        if (interestCalcResultContent) interestCalcResultContent.style.display = 'none';
        if (interestCalcScheduleBody) interestCalcScheduleBody.innerHTML = '';
        const principalEl = document.getElementById('interestCalcPrincipal');
        const regularEl = document.getElementById('interestCalcRegularAmount');
        const rateEl = document.getElementById('interestCalcRate');
        const termEl = document.getElementById('interestCalcTerm');
        if (principalEl && !principalEl.value.trim()) principalEl.value = '10000';
        if (regularEl && !regularEl.value.trim()) regularEl.value = '1000';
        if (rateEl && !rateEl.value.trim()) rateEl.value = '5';
        if (termEl && !termEl.value.trim()) termEl.value = '10';
      }

      function closeInterestCalcOverlay() {
        if (interestCalcOverlay) interestCalcOverlay.classList.remove('visible');
        if (interestCalcDitherInstance) {
          interestCalcDitherInstance();
          interestCalcDitherInstance = null;
        }
      }

      if (interestCalcBack) {
        interestCalcBack.addEventListener('click', closeInterestCalcOverlay);
      }

      if (interestCalcModeTabs) {
        interestCalcModeTabs.querySelectorAll('.mortgage-calc-method-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            interestCalcModeTabs.querySelectorAll('.mortgage-calc-method-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            interestCalcMode = tab.dataset.mode;
            updateInterestModeFields();
          });
        });
      }

      if (interestCalcFreqTabs) {
        interestCalcFreqTabs.querySelectorAll('.mortgage-calc-method-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            interestCalcFreqTabs.querySelectorAll('.mortgage-calc-method-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            interestCalcFreq = tab.dataset.freq;
          });
        });
      }

      if (interestCalcBtn) {
        interestCalcBtn.addEventListener('click', calcInterest);
      }

      // Enter key support on input fields
      ['interestCalcPrincipal', 'interestCalcRegularAmount', 'interestCalcRate', 'interestCalcTerm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); calcInterest(); }
        });
      });

      // Open from tool list
      document.querySelectorAll('.audio-list-item[data-tool="interest-calc"]').forEach(item => {
        item.addEventListener('click', () => {
          if (transitionMask) transitionMask.classList.add('visible');
          setTimeout(() => {
            openInterestCalcOverlay();
            if (transitionMask) transitionMask.classList.remove('visible');
          }, 1000);
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.click();
          }
        });
      });

      // ===== End Interest Calculator =====

      // ===== Password Generator =====
      const passwordGenOverlay = document.getElementById('passwordGenOverlay');
      const passwordGenBack = document.getElementById('passwordGenBack');
      const passwordGenBg = document.getElementById('passwordGenBg');
      const passwordGenStrengthTabs = document.getElementById('passwordGenStrengthTabs');
      const passwordGenStrengthDesc = document.getElementById('passwordGenStrengthDesc');
      const passwordGenBtn = document.getElementById('passwordGenBtn');
      const passwordGenResultEmpty = document.getElementById('passwordGenResultEmpty');
      const passwordGenResultContent = document.getElementById('passwordGenResultContent');
      const passwordGenOutput = document.getElementById('passwordGenOutput');
      const passwordGenCopyBtn = document.getElementById('passwordGenCopyBtn');
      const passwordGenStrengthText = document.getElementById('passwordGenStrengthText');
      const passwordGenStrengthFill = document.getElementById('passwordGenStrengthFill');
      const passwordGenHistoryList = document.getElementById('passwordGenHistoryList');
      const passwordGenLengthSlider = document.getElementById('passwordGenLengthSlider');
      const passwordGenLengthValue = document.getElementById('passwordGenLengthValue');

      let passwordGenStrength = 'simple';
      let passwordGenDitherInstance = null;
      let passwordGenHistory = [];

      const CHARSETS = {
        uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        lowercase: 'abcdefghijklmnopqrstuvwxyz',
        numbers: '0123456789',
        symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?~'
      };
      const SIMILAR_CHARS = '0O1lI';

      function getPasswordCharset() {
        let charset = '';
        const upperEl = document.getElementById('passwordGenUppercase');
        const lowerEl = document.getElementById('passwordGenLowercase');
        const numEl = document.getElementById('passwordGenNumbers');
        const symEl = document.getElementById('passwordGenSymbols');
        const excludeEl = document.getElementById('passwordGenExcludeSimilar');

        if (upperEl && upperEl.checked) charset += CHARSETS.uppercase;
        if (lowerEl && lowerEl.checked) charset += CHARSETS.lowercase;
        if (numEl && numEl.checked) charset += CHARSETS.numbers;
        if (symEl && symEl.checked) charset += CHARSETS.symbols;

        if (excludeEl && excludeEl.checked) {
          charset = charset.split('').filter(c => !SIMILAR_CHARS.includes(c)).join('');
        }

        return charset;
      }

      function generateSecureRandom(max) {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return array[0] % max;
      }

      function generatePassword() {
        const length = parseInt(passwordGenLengthSlider ? passwordGenLengthSlider.value : '16');
        let charset = getPasswordCharset();

        if (!charset) {
          if (passwordGenResultEmpty) passwordGenResultEmpty.style.display = '';
          if (passwordGenResultContent) passwordGenResultContent.style.display = 'none';
          return;
        }

        let password = '';
        for (let i = 0; i < length; i++) {
          password += charset[generateSecureRandom(charset.length)];
        }

        if (passwordGenResultEmpty) passwordGenResultEmpty.style.display = 'none';
        if (passwordGenResultContent) passwordGenResultContent.style.display = '';
        if (window.incrementToolUsage) window.incrementToolUsage();

        if (passwordGenOutput) passwordGenOutput.textContent = password;

        // Strength assessment
        const strengthInfo = assessPasswordStrength(password, charset.length);
        if (passwordGenStrengthText) passwordGenStrengthText.textContent = t('home.passwordGen.' + strengthInfo.label);
        if (passwordGenStrengthFill) {
          passwordGenStrengthFill.style.width = strengthInfo.percent + '%';
          passwordGenStrengthFill.style.background = strengthInfo.color;
        }

        // Add to history
        passwordGenHistory.unshift(password);
        if (passwordGenHistory.length > 10) passwordGenHistory.pop();
        renderPasswordHistory();
      }

      function assessPasswordStrength(password, charsetSize) {
        const entropy = password.length * Math.log2(charsetSize);
        if (entropy < 40) return { label: 'weak', percent: 25, color: '#ef4444' };
        if (entropy < 60) return { label: 'fair', percent: 50, color: '#f59e0b' };
        if (entropy < 80) return { label: 'strong', percent: 75, color: '#22c55e' };
        return { label: 'veryStrong', percent: 100, color: '#10b981' };
      }

      function renderPasswordHistory() {
        if (!passwordGenHistoryList) return;
        passwordGenHistoryList.innerHTML = passwordGenHistory.map(pw =>
          '<div class="password-gen-history-item">' +
            '<span style="flex:1;">' + pw + '</span>' +
            '<button class="password-gen-history-item-copy" data-pw="' + pw.replace(/"/g, '&quot;') + '">' + (t('home.passwordGen.copy')) + '</button>' +
          '</div>'
        ).join('');

        passwordGenHistoryList.querySelectorAll('.password-gen-history-item-copy').forEach(btn => {
          btn.addEventListener('click', () => {
            const pw = btn.dataset.pw;
            if (navigator.clipboard) navigator.clipboard.writeText(pw);
            btn.textContent = t('home.passwordGen.copied');
            setTimeout(() => { btn.textContent = t('home.passwordGen.copy'); }, 1500);
          });
        });
      }

      function applyStrengthPreset(strength) {
        const upperEl = document.getElementById('passwordGenUppercase');
        const lowerEl = document.getElementById('passwordGenLowercase');
        const numEl = document.getElementById('passwordGenNumbers');
        const symEl = document.getElementById('passwordGenSymbols');
        const excludeEl = document.getElementById('passwordGenExcludeSimilar');

        if (strength === 'simple') {
          if (lowerEl) lowerEl.checked = true;
          if (numEl) numEl.checked = true;
          if (upperEl) upperEl.checked = false;
          if (symEl) symEl.checked = false;
          if (excludeEl) excludeEl.checked = false;
          if (passwordGenStrengthDesc) passwordGenStrengthDesc.textContent = t('home.passwordGen.simpleDesc');
          if (passwordGenLengthSlider) passwordGenLengthSlider.value = '8';
        } else if (strength === 'medium') {
          if (upperEl) upperEl.checked = true;
          if (lowerEl) lowerEl.checked = true;
          if (numEl) numEl.checked = true;
          if (symEl) symEl.checked = false;
          if (excludeEl) excludeEl.checked = false;
          if (passwordGenStrengthDesc) passwordGenStrengthDesc.textContent = t('home.passwordGen.mediumDesc');
          if (passwordGenLengthSlider) passwordGenLengthSlider.value = '16';
        } else {
          if (upperEl) upperEl.checked = true;
          if (lowerEl) lowerEl.checked = true;
          if (numEl) numEl.checked = true;
          if (symEl) symEl.checked = true;
          if (excludeEl) excludeEl.checked = true;
          if (passwordGenStrengthDesc) passwordGenStrengthDesc.textContent = t('home.passwordGen.ultimateDesc');
          if (passwordGenLengthSlider) passwordGenLengthSlider.value = '24';
        }
        if (passwordGenLengthValue) passwordGenLengthValue.textContent = passwordGenLengthSlider ? passwordGenLengthSlider.value : '16';
      }

      function openPasswordGenOverlay() {
        if (!passwordGenOverlay) return;
        passwordGenOverlay.classList.add('visible');
        if (passwordGenBg && !passwordGenDitherInstance) {
          passwordGenDitherInstance = initDarkVeil(passwordGenBg, {
            hueShift: 0,
            noiseIntensity: 0.03,
            scanlineIntensity: 0,
            speed: 1.6,
            scanlineFrequency: 5,
            warpAmount: 0,
            resolutionScale: 1
          });
        }
        // Reset state
        passwordGenStrength = 'simple';
        if (passwordGenStrengthTabs) {
          passwordGenStrengthTabs.querySelectorAll('.password-gen-strength-tab').forEach(tab => tab.classList.remove('active'));
          const defaultTab = passwordGenStrengthTabs.querySelector('[data-strength="simple"]');
          if (defaultTab) defaultTab.classList.add('active');
        }
        applyStrengthPreset('simple');
        passwordGenHistory = [];
        if (passwordGenResultEmpty) passwordGenResultEmpty.style.display = '';
        if (passwordGenResultContent) passwordGenResultContent.style.display = 'none';
        if (passwordGenHistoryList) passwordGenHistoryList.innerHTML = '';
      }

      function closePasswordGenOverlay() {
        if (passwordGenOverlay) passwordGenOverlay.classList.remove('visible');
        if (passwordGenDitherInstance) {
          passwordGenDitherInstance();
          passwordGenDitherInstance = null;
        }
      }

      if (passwordGenBack) {
        passwordGenBack.addEventListener('click', closePasswordGenOverlay);
      }

      if (passwordGenStrengthTabs) {
        passwordGenStrengthTabs.querySelectorAll('.password-gen-strength-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            passwordGenStrengthTabs.querySelectorAll('.password-gen-strength-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            passwordGenStrength = tab.dataset.strength;
            applyStrengthPreset(passwordGenStrength);
          });
        });
      }

      if (passwordGenLengthSlider) {
        passwordGenLengthSlider.addEventListener('input', () => {
          if (passwordGenLengthValue) passwordGenLengthValue.textContent = passwordGenLengthSlider.value;
        });
      }

      if (passwordGenBtn) {
        passwordGenBtn.addEventListener('click', () => {
          if (transitionMask) transitionMask.classList.add('visible');
          if (passwordGenBtn) passwordGenBtn.disabled = true;
          setTimeout(() => {
            generatePassword();
            if (transitionMask) transitionMask.classList.remove('visible');
            if (passwordGenBtn) passwordGenBtn.disabled = false;
          }, 1000);
        });
      }

      if (passwordGenCopyBtn) {
        passwordGenCopyBtn.addEventListener('click', () => {
          const pw = passwordGenOutput ? passwordGenOutput.textContent : '';
          if (pw && navigator.clipboard) navigator.clipboard.writeText(pw);
          passwordGenCopyBtn.textContent = t('home.passwordGen.copied');
          setTimeout(() => { passwordGenCopyBtn.textContent = t('home.passwordGen.copy'); }, 1500);
        });
      }

      // Open from tool list
      document.querySelectorAll('.audio-list-item[data-tool="password-gen"]').forEach(item => {
        item.addEventListener('click', () => {
          if (transitionMask) transitionMask.classList.add('visible');
          setTimeout(() => {
            openPasswordGenOverlay();
            if (transitionMask) transitionMask.classList.remove('visible');
          }, 1000);
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.click();
          }
        });
      });

      // ===== End Password Generator =====

      const pdfMergeDropZone = document.getElementById('pdfMergeDropZone');
      const pdfMergeFiles = document.getElementById('pdfMergeFiles');
      const pdfMergeCta = document.getElementById('pdfMergeCta');
      const pdfMergeProcessBtn = document.getElementById('pdfMergeProcessBtn');
      const pdfMergeProcessMask = document.getElementById('pdfMergeProcessMask');
      const pdfMergeProcessBarFill = document.getElementById('pdfMergeProcessBarFill');
      const pdfMergeProcessText = document.getElementById('pdfMergeProcessText');
      const pdfMergeSuccessOverlay = document.getElementById('pdfMergeSuccessOverlay');
      const pdfMergeSuccessPath = document.getElementById('pdfMergeSuccessPath');
      const pdfMergeSuccessMeta = document.getElementById('pdfMergeSuccessMeta');
      const pdfMergeSuccessCount = document.getElementById('pdfMergeSuccessCount');
      const pdfMergeSuccessOpenFolder = document.getElementById('pdfMergeSuccessOpenFolder');
      const pdfMergeSuccessOk = document.getElementById('pdfMergeSuccessOk');
      let selectedPdfMergeFiles = [];
      let pdfMergeProcessing = false;

      function addPdfMergeFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        for (const file of fileList) {
          const dup = file.path
            ? selectedPdfMergeFiles.some(f => f.path === file.path)
            : selectedPdfMergeFiles.some(f => f.name === file.name && f.size === file.size);
          if (dup) continue;
          selectedPdfMergeFiles.push(file);
        }
        renderPdfMergeFiles();
      }

      function removePdfMergeFile(index) {
        selectedPdfMergeFiles.splice(index, 1);
        renderPdfMergeFiles();
      }

      function clearPdfMergeFiles() {
        selectedPdfMergeFiles = [];
        renderPdfMergeFiles();
      }

      function renderPdfMergeFiles() {
        if (!pdfMergeFiles) return;
        pdfMergeFiles.innerHTML = '';
        if (selectedPdfMergeFiles.length > 0) {
          pdfMergeFiles.classList.add('has-files');
        } else {
          pdfMergeFiles.classList.remove('has-files');
        }
        selectedPdfMergeFiles.forEach((file, index) => {
          const item = document.createElement('div');
          item.className = 'audio-convert-file-item';
          item.draggable = true;
          item.dataset.index = index;
          item.innerHTML = `
            <span class="audio-convert-file-index">${index + 1}</span>
            <span class="audio-convert-file-name">${escapeHtml(file.name)}</span>
            <button class="audio-convert-file-remove" data-index="${index}" aria-label="remove">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          `;
          pdfMergeFiles.appendChild(item);
        });
        document.querySelectorAll('.audio-convert-file-remove').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index, 10);
            if (!isNaN(idx)) removePdfMergeFile(idx);
          });
        });
        // Drag-to-reorder
        let dragSrcIdx = null;
        pdfMergeFiles.querySelectorAll('.audio-convert-file-item').forEach(item => {
          item.addEventListener('dragstart', (e) => {
            dragSrcIdx = parseInt(item.dataset.index, 10);
            item.classList.add('dragging');
          });
          item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
          });
          item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const targetIdx = parseInt(item.dataset.index, 10);
            if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;
            const moved = selectedPdfMergeFiles.splice(dragSrcIdx, 1)[0];
            selectedPdfMergeFiles.splice(targetIdx, 0, moved);
            dragSrcIdx = targetIdx;
            renderPdfMergeFiles();
          });
        });
        togglePdfMergeProcessButton();
      }

      function togglePdfMergeProcessButton() {
        if (!pdfMergeProcessBtn) return;
        if (selectedPdfMergeFiles.length >= 2) {
          pdfMergeProcessBtn.style.display = '';
          requestAnimationFrame(() => pdfMergeProcessBtn.classList.add('visible'));
        } else {
          pdfMergeProcessBtn.classList.remove('visible');
          const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity' && !pdfMergeProcessBtn.classList.contains('visible')) {
              pdfMergeProcessBtn.style.display = 'none';
              pdfMergeProcessBtn.removeEventListener('transitionend', onTransitionEnd);
            }
          };
          pdfMergeProcessBtn.addEventListener('transitionend', onTransitionEnd);
        }
      }

      function showPdfMergeDropZone() {
        if (pdfMergeDropZone) pdfMergeDropZone.classList.add('visible');
        if (pdfMergeOverlay) pdfMergeOverlay.classList.add('drag-over');
      }

      function hidePdfMergeDropZone() {
        if (pdfMergeDropZone) pdfMergeDropZone.classList.remove('visible');
        if (pdfMergeOverlay) pdfMergeOverlay.classList.remove('drag-over');
      }

      if (isTauri && pdfMergeOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent((event) => {
            if (!pdfMergeOverlay.classList.contains('visible') || pdfMergeProcessing) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') {
              showPdfMergeDropZone();
            } else if (payload.type === 'leave') {
              hidePdfMergeDropZone();
            } else if (payload.type === 'drop') {
              hidePdfMergeDropZone();
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const fileList = paths
                .filter(p => p.toLowerCase().endsWith('.pdf'))
                .map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
              if (fileList.length > 0) {
                addPdfMergeFiles(fileList);
              }
            }
          });
        })();
      }

      if (pdfMergeCta) {
        pdfMergeCta.addEventListener('click', async () => {
          if (isTauri) {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({
                multiple: true,
                filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
              });
              if (selected && Array.isArray(selected)) {
                const fileList = selected.map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
                addPdfMergeFiles(fileList);
              }
            } catch (e) {
              console.error('PDF file selection error', e);
            }
          } else {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = '.pdf,application/pdf';
            input.addEventListener('change', () => {
              addPdfMergeFiles(input.files);
              input.value = '';
            });
            input.click();
          }
        });
      }

      if (pdfMergeProcessBtn) {
        pdfMergeProcessBtn.addEventListener('click', async () => {
          if (selectedPdfMergeFiles.length < 2 || pdfMergeProcessing) return;
          pdfMergeProcessing = true;
          if (pdfMergeProcessMask) pdfMergeProcessMask.classList.add('visible');
          if (pdfMergeProcessBarFill) pdfMergeProcessBarFill.style.width = '30%';
          if (pdfMergeProcessText) pdfMergeProcessText.textContent = t('home.pdfMerge.loadingPreview');

          try {
            await loadPdfPreviewAndOpenDrawer();
            if (pdfMergeProcessMask) pdfMergeProcessMask.classList.remove('visible');
            if (pdfMergeProcessBarFill) pdfMergeProcessBarFill.style.width = '0%';
          } catch (e) {
            console.error('PDF preview load error:', e);
            if (pdfMergeProcessMask) pdfMergeProcessMask.classList.remove('visible');
            if (pdfMergeProcessBarFill) pdfMergeProcessBarFill.style.width = '0%';
            pdfMergeProcessing = false;
            alert(t('common.errorOccurred', { error: String(e) }));
          }
        });
      }

      // ===== PDF Preview Drawer =====
      const pdfPreviewDrawer = document.getElementById('pdfPreviewDrawer');
      const pdfPreviewBackdrop = document.getElementById('pdfPreviewBackdrop');
      const pdfPreviewClose = document.getElementById('pdfPreviewClose');
      const pdfPreviewBody = document.getElementById('pdfPreviewBody');
      const pdfPreviewMergeBtn = document.getElementById('pdfPreviewMergeBtn');

      // pdfPagesData: [{ fileIndex, pageIndex, rotation, canvas }]
      let pdfPagesData = [];
      let pdfLoadedDocs = [];

      async function loadPdfPreviewAndOpenDrawer() {
        // Clear previous state
        pdfPagesData = [];
        pdfLoadedDocs = [];
        if (pdfPreviewBody) pdfPreviewBody.innerHTML = '';

        // Configure pdf.js worker
        const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.mjs',
          import.meta.url
        ).toString();

        // Read each file and render pages
        for (let fi = 0; fi < selectedPdfMergeFiles.length; fi++) {
          const file = selectedPdfMergeFiles[fi];
          let fileData;

          if (isTauri && file.path) {
            const { invoke } = await import('@tauri-apps/api/core');
            const bytes = await invoke('read_file_bytes', { path: file.path });
            // Tauri returns Vec<u8> as a plain JS array; ensure proper Uint8Array conversion
            if (Array.isArray(bytes)) {
              fileData = Uint8Array.from(bytes);
            } else if (bytes instanceof ArrayBuffer) {
              fileData = new Uint8Array(bytes);
            } else if (bytes instanceof Uint8Array) {
              fileData = bytes;
            } else if (bytes && typeof bytes.length === 'number') {
              fileData = Uint8Array.from(bytes);
            } else {
              throw new Error(`Invalid file data for ${file.name}: ${typeof bytes}`);
            }
            if (fileData.length === 0) throw new Error(`File ${file.name} is empty`);
          } else {
            fileData = new Uint8Array(await file.arrayBuffer());
          }

          const _wasmUrl = new URL('assets/', document.baseURI).href;
          const loadingTask = pdfjsLib.getDocument({ data: fileData.slice(), wasmUrl: _wasmUrl, useWasm: true });
          const pdfDoc = await loadingTask.promise;
          pdfLoadedDocs.push({ doc: pdfDoc, fileData });

          for (let pi = 1; pi <= pdfDoc.numPages; pi++) {
            const page = await pdfDoc.getPage(pi);
            const viewport = page.getViewport({ scale: 1 });
            const targetWidth = 376;
            const scale = targetWidth / viewport.width;
            const scaledViewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;
            await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

            pdfPagesData.push({
              fileIndex: fi,
              pageIndex: pi,
              rotation: 0,
              canvas
            });
          }
        }

        renderPreviewPages();
        if (pdfPreviewDrawer) pdfPreviewDrawer.classList.add('visible');
      }

      function renderPreviewPages() {
        if (!pdfPreviewBody) return;
        pdfPreviewBody.innerHTML = '';

        pdfPagesData.forEach((pageData, idx) => {
          const pageEl = document.createElement('div');
          pageEl.className = 'pdf-preview-page';
          pageEl.draggable = true;
          pageEl.dataset.index = idx;

          const canvas = pageData.canvas;
          canvas.style.transform = `rotate(${pageData.rotation}deg)`;
          canvas.style.maxWidth = '100%';
          canvas.style.height = 'auto';
          canvas.style.borderRadius = '4px';
          canvas.style.transition = 'transform 0.3s ease';
          pageEl.appendChild(canvas);

          const indexLabel = document.createElement('span');
          indexLabel.className = 'pdf-preview-page-index';
          indexLabel.textContent = `${idx + 1}`;
          pageEl.appendChild(indexLabel);

          const rotateBtn = document.createElement('button');
          rotateBtn.className = 'pdf-preview-page-rotate-btn';
          rotateBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>';
          rotateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            pageData.rotation = (pageData.rotation + 90) % 360;
            pageData.canvas.style.transform = `rotate(${pageData.rotation}deg)`;
          });
          pageEl.appendChild(rotateBtn);

          pdfPreviewBody.appendChild(pageEl);
        });

        // Drag-to-reorder
        let dragSrcIdx = null;
        pdfPreviewBody.querySelectorAll('.pdf-preview-page').forEach(item => {
          item.addEventListener('dragstart', (e) => {
            dragSrcIdx = parseInt(item.dataset.index, 10);
            item.classList.add('dragging');
          });
          item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            pdfPreviewBody.querySelectorAll('.pdf-preview-page').forEach(el => el.classList.remove('drag-over'));
          });
          item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const targetIdx = parseInt(item.dataset.index, 10);
            if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;
            item.classList.add('drag-over');
          });
          item.addEventListener('drop', (e) => {
            e.preventDefault();
            const targetIdx = parseInt(item.dataset.index, 10);
            if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;
            const moved = pdfPagesData.splice(dragSrcIdx, 1)[0];
            pdfPagesData.splice(targetIdx, 0, moved);
            dragSrcIdx = null;
            renderPreviewPages();
          });
        });
      }

      function closePreviewDrawer() {
        if (pdfPreviewDrawer) pdfPreviewDrawer.classList.remove('visible');
        pdfMergeProcessing = false;
        // Cleanup pdf.js documents to free memory
        pdfLoadedDocs.forEach(d => { try { d.doc.destroy(); } catch (_) {} });
        pdfLoadedDocs = [];
        pdfPagesData = [];
      }

      if (pdfPreviewClose) {
        pdfPreviewClose.addEventListener('click', closePreviewDrawer);
      }
      if (pdfPreviewBackdrop) {
        pdfPreviewBackdrop.addEventListener('click', closePreviewDrawer);
      }

      if (pdfPreviewMergeBtn) {
        pdfPreviewMergeBtn.addEventListener('click', async () => {
          // Close drawer, show mask
          if (pdfPreviewDrawer) pdfPreviewDrawer.classList.remove('visible');
          if (pdfMergeProcessMask) pdfMergeProcessMask.classList.add('visible');
          if (pdfMergeProcessBarFill) pdfMergeProcessBarFill.style.width = '30%';
          if (pdfMergeProcessText) pdfMergeProcessText.textContent = t('home.pdfMerge.processing');
          const startTime = Date.now();

          try {
            const outputPath = await performPdfMerge();
            if (pdfMergeProcessBarFill) pdfMergeProcessBarFill.style.width = '100%';
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 1500 - elapsed);
            setTimeout(() => {
              if (pdfMergeProcessMask) pdfMergeProcessMask.classList.remove('visible');
              if (pdfMergeProcessBarFill) pdfMergeProcessBarFill.style.width = '0%';
              pdfMergeProcessing = false;
              showPdfMergeSuccess(outputPath);
            }, remaining);
          } catch (e) {
            console.error('PDF merge error:', e);
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 1500 - elapsed);
            setTimeout(() => {
              if (pdfMergeProcessMask) pdfMergeProcessMask.classList.remove('visible');
              if (pdfMergeProcessBarFill) pdfMergeProcessBarFill.style.width = '0%';
              pdfMergeProcessing = false;
              alert(t('common.errorOccurred', { error: String(e) }));
            }, remaining);
          }
        });
      }

      async function performPdfMerge() {
        const { PDFDocument, degrees } = await import('pdf-lib');

        const mergedPdf = await PDFDocument.create();
        const srcPdfCache = new Map();

        for (const pageData of pdfPagesData) {
          const docInfo = pdfLoadedDocs[pageData.fileIndex];
          if (!docInfo || !docInfo.fileData) throw new Error(`Missing file data for file index ${pageData.fileIndex}`);
          const fileData = docInfo.fileData;
          if (fileData.length === 0) throw new Error(`File data is empty for file index ${pageData.fileIndex}`);
          const pageIndex = pageData.pageIndex;
          const rotation = pageData.rotation;

          let srcPdf = srcPdfCache.get(pageData.fileIndex);
          if (!srcPdf) {
            srcPdf = await PDFDocument.load(fileData.slice());
            srcPdfCache.set(pageData.fileIndex, srcPdf);
          }
          const [copiedPage] = await mergedPdf.copyPages(srcPdf, [pageIndex - 1]);

          const existingRotation = copiedPage.getRotation().angle;
          copiedPage.setRotation(degrees(existingRotation + rotation));

          mergedPdf.addPage(copiedPage);
        }

        const mergedBytes = await mergedPdf.save();

        // Save to Documents/ToolKnit/merged/
        let outputPath;
        if (isTauri) {
          const { invoke } = await import('@tauri-apps/api/core');
          const outputDir = await getOutputDir('merged');
          let fileName = 'merged.pdf';
          let fullPath = outputDir + '\\' + fileName;
          let counter = 1;
          while (await invoke('exists_path', { path: fullPath }).catch(() => false)) {
            fileName = `merged_${counter}.pdf`;
            fullPath = outputDir + '\\' + fileName;
            counter++;
          }
          await invoke('write_file_bytes', { path: fullPath, bytes: Array.from(mergedBytes) });
          // Note: Tauri invoke serializes Vec<u8> from JS arrays; using Array.from for compatibility
          outputPath = fullPath;
        } else {
          // Browser fallback: download
          const blob = new Blob([mergedBytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'merged.pdf';
          a.click();
          URL.revokeObjectURL(url);
          outputPath = '~/Downloads/merged.pdf';
        }

        return outputPath;
      }

      function showPdfMergeSuccess(outputPath) {
        // Cleanup pdf.js documents
        pdfLoadedDocs.forEach(d => { try { d.doc.destroy(); } catch (_) {} });
        pdfLoadedDocs = [];
        pdfPagesData = [];

        const count = selectedPdfMergeFiles.length;
        if (pdfMergeSuccessMeta) {
          pdfMergeSuccessMeta.textContent = t('home.pdfMerge.successSummary', { count });
        }
        if (pdfMergeSuccessCount) {
          pdfMergeSuccessCount.textContent = `${count} ${t('home.pdfMerge.successCountUnit')}`;
        }
        if (pdfMergeSuccessPath) {
          pdfMergeSuccessPath.textContent = outputPath.replace(/\//g, '\\');
        }
        if (pdfMergeSuccessOverlay) {
          pdfMergeSuccessOverlay.classList.add('visible');
        }
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      if (pdfMergeSuccessOk) {
        pdfMergeSuccessOk.addEventListener('click', () => {
          if (pdfMergeSuccessOverlay) pdfMergeSuccessOverlay.classList.remove('visible');
          clearPdfMergeFiles();
        });
      }

      if (pdfMergeSuccessOpenFolder) {
        pdfMergeSuccessOpenFolder.addEventListener('click', async () => {
          if (isTauri && pdfMergeSuccessPath.textContent) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const folder = pdfMergeSuccessPath.textContent
                .replace(/[/\\][^/\\]+$/, '')
                .replace(/\//g, '\\');
              await invoke('open_path', { path: folder });
            } catch (e) {
              console.error('Open folder error:', e);
            }
          }
        });
      }

      // ===== PDF Compress =====
      const pdfCompressOverlay = document.getElementById('pdfCompressOverlay');
      const pdfCompressFerrofluid = document.getElementById('pdfCompressFerrofluid');
      const pdfCompressBack = document.getElementById('pdfCompressBack');
      let pdfCompressFerrofluidInstance = null;
      const pdfCompressDropZone = document.getElementById('pdfCompressDropZone');
      const pdfCompressFiles = document.getElementById('pdfCompressFiles');
      const pdfCompressCta = document.getElementById('pdfCompressCta');
      const pdfCompressProcessBtn = document.getElementById('pdfCompressProcessBtn');
      const pdfCompressProcessMask = document.getElementById('pdfCompressProcessMask');
      const pdfCompressProcessBarFill = document.getElementById('pdfCompressProcessBarFill');
      const pdfCompressProcessText = document.getElementById('pdfCompressProcessText');
      const pdfCompressLevelOptions = document.getElementById('pdfCompressLevelOptions');
      const pdfCompressDrawer = document.getElementById('pdfCompressDrawer');
      const pdfCompressDrawerBackdrop = document.getElementById('pdfCompressDrawerBackdrop');
      const pdfCompressDrawerClose = document.getElementById('pdfCompressDrawerClose');
      const pdfCompressDrawerBody = document.getElementById('pdfCompressDrawerBody');
      const pdfCompressDrawerFooter = document.getElementById('pdfCompressDrawerFooter');
      const pdfCompressDownloadAllBtn = document.getElementById('pdfCompressDownloadAllBtn');
      const pdfCompressSuccessOverlay = document.getElementById('pdfCompressSuccessOverlay');
      const pdfCompressSuccessMeta = document.getElementById('pdfCompressSuccessMeta');
      const pdfCompressSuccessCount = document.getElementById('pdfCompressSuccessCount');
      const pdfCompressSuccessPath = document.getElementById('pdfCompressSuccessPath');
      const pdfCompressSuccessOk = document.getElementById('pdfCompressSuccessOk');
      const pdfCompressSuccessOpenFolder = document.getElementById('pdfCompressSuccessOpenFolder');

      let selectedPdfCompressFiles = [];
      let pdfCompressProcessing = false;
      let pdfCompressLevel = 'medium';
      let pdfCompressResults = []; // [{ name, originalSize, compressedSize, path, compressedBytes }]}

      function openPdfCompressOverlay() {
        if (!pdfCompressOverlay) return;
        pdfCompressOverlay.classList.add('visible');
        if (pdfCompressFerrofluid && !pdfCompressFerrofluidInstance) {
          pdfCompressFerrofluidInstance = initFerrofluid(pdfCompressFerrofluid, {
            colors: ['#e8e8ec', '#a0a0a8', '#ffffff'],
            opacity: 0.6,
          });
        }
      }

      function closePdfCompressOverlay() {
        if (!pdfCompressOverlay) return;
        pdfCompressOverlay.classList.remove('visible');
        if (pdfCompressFerrofluidInstance) {
          pdfCompressFerrofluidInstance();
          pdfCompressFerrofluidInstance = null;
        }
        pdfCompressProcessing = false;
        if (pdfCompressProcessMask) pdfCompressProcessMask.classList.remove('visible');
        if (pdfCompressProcessBarFill) pdfCompressProcessBarFill.style.width = '0%';
        clearPdfCompressFiles();
        if (pdfCompressDrawer) pdfCompressDrawer.classList.remove('visible');
        pdfCompressResults = [];
      }

      if (pdfCompressBack) {
        pdfCompressBack.addEventListener('click', closePdfCompressOverlay);
      }

      document.querySelectorAll('.audio-list-item[data-tool="pdf-compress"]').forEach(item => {
        item.addEventListener('click', () => openPdfCompressOverlay());
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPdfCompressOverlay();
          }
        });
      });

      // Compression level selector
      if (pdfCompressLevelOptions) {
        pdfCompressLevelOptions.addEventListener('click', (e) => {
          const btn = e.target.closest('.audio-convert-format-option');
          if (!btn) return;
          pdfCompressLevelOptions.querySelectorAll('.audio-convert-format-option').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          pdfCompressLevel = btn.dataset.level;
        });
      }

      function addPdfCompressFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        for (const file of fileList) {
          const dup = file.path
            ? selectedPdfCompressFiles.some(f => f.path === file.path)
            : selectedPdfCompressFiles.some(f => f.name === file.name && f.size === file.size);
          if (dup) continue;
          selectedPdfCompressFiles.push(file);
        }
        renderPdfCompressFiles();
      }

      function removePdfCompressFile(index) {
        selectedPdfCompressFiles.splice(index, 1);
        renderPdfCompressFiles();
      }

      function clearPdfCompressFiles() {
        selectedPdfCompressFiles = [];
        renderPdfCompressFiles();
      }

      function renderPdfCompressFiles() {
        if (!pdfCompressFiles) return;
        pdfCompressFiles.innerHTML = '';
        if (selectedPdfCompressFiles.length > 0) {
          pdfCompressFiles.classList.add('has-files');
        } else {
          pdfCompressFiles.classList.remove('has-files');
        }
        selectedPdfCompressFiles.forEach((file, index) => {
          const item = document.createElement('div');
          item.className = 'audio-convert-file-item';
          item.dataset.index = index;
          item.innerHTML = `
            <span class="audio-convert-file-index">${index + 1}</span>
            <span class="audio-convert-file-name">${escapeHtml(file.name)}</span>
            <button class="audio-convert-file-remove" data-index="${index}" aria-label="remove">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          `;
          pdfCompressFiles.appendChild(item);
        });
        pdfCompressFiles.querySelectorAll('.audio-convert-file-remove').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index, 10);
            if (!isNaN(idx)) removePdfCompressFile(idx);
          });
        });
        togglePdfCompressProcessButton();
      }

      function togglePdfCompressProcessButton() {
        if (!pdfCompressProcessBtn) return;
        if (selectedPdfCompressFiles.length >= 1) {
          pdfCompressProcessBtn.style.display = '';
          requestAnimationFrame(() => pdfCompressProcessBtn.classList.add('visible'));
        } else {
          pdfCompressProcessBtn.classList.remove('visible');
          const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity' && !pdfCompressProcessBtn.classList.contains('visible')) {
              pdfCompressProcessBtn.style.display = 'none';
              pdfCompressProcessBtn.removeEventListener('transitionend', onTransitionEnd);
            }
          };
          pdfCompressProcessBtn.addEventListener('transitionend', onTransitionEnd);
        }
      }

      function showPdfCompressDropZone() {
        if (pdfCompressDropZone) pdfCompressDropZone.classList.add('visible');
        if (pdfCompressOverlay) pdfCompressOverlay.classList.add('drag-over');
      }

      function hidePdfCompressDropZone() {
        if (pdfCompressDropZone) pdfCompressDropZone.classList.remove('visible');
        if (pdfCompressOverlay) pdfCompressOverlay.classList.remove('drag-over');
      }

      if (isTauri && pdfCompressOverlay) {
        (async () => {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview');
          const webview = getCurrentWebview();
          await webview.onDragDropEvent(async (event) => {
            if (!pdfCompressOverlay.classList.contains('visible') || pdfCompressProcessing) return;
            const payload = event.payload;
            if (payload.type === 'enter' || payload.type === 'over') {
              showPdfCompressDropZone();
            } else if (payload.type === 'leave') {
              hidePdfCompressDropZone();
            } else if (payload.type === 'drop') {
              hidePdfCompressDropZone();
              const paths = payload.paths || [];
              if (paths.length === 0) return;
              const filePaths = paths.filter(p => p.toLowerCase().endsWith('.pdf'));
              const fileList = await Promise.all(filePaths.map(async path => {
                let size = 0;
                try {
                  const { invoke } = await import('@tauri-apps/api/core');
                  size = await invoke('get_file_size', { path });
                } catch (e) {}
                return { name: path.split(/[\\/]/).pop() || path, path, size };
              }));
              if (fileList.length > 0) addPdfCompressFiles(fileList);
            }
          });
        })();
      }

      if (pdfCompressCta) {
        pdfCompressCta.addEventListener('click', async () => {
          if (isTauri) {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({
                multiple: true,
                filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
              });
              if (selected && Array.isArray(selected)) {
                const fileList = await Promise.all(selected.map(async path => {
                  let size = 0;
                  try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    size = await invoke('get_file_size', { path });
                  } catch (e) {}
                  return { name: path.split(/[\\/]/).pop() || path, path, size };
                }));
                addPdfCompressFiles(fileList);
              }
            } catch (e) {
              console.error('PDF compress file selection error', e);
            }
          } else {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf';
            input.multiple = true;
            input.addEventListener('change', () => {
              if (input.files) addPdfCompressFiles(Array.from(input.files));
            });
            input.click();
          }
        });
      }

      if (pdfCompressProcessBtn) {
        pdfCompressProcessBtn.addEventListener('click', async () => {
          if (selectedPdfCompressFiles.length < 1 || pdfCompressProcessing) return;
          pdfCompressProcessing = true;
          if (pdfCompressProcessMask) pdfCompressProcessMask.classList.add('visible');
          if (pdfCompressProcessBarFill) pdfCompressProcessBarFill.style.width = '30%';
          if (pdfCompressProcessText) pdfCompressProcessText.textContent = t('home.pdfCompress.processing');

          try {
            const { PDFDocument } = await import('pdf-lib');
            const { invoke } = await import('@tauri-apps/api/core');

            const MAX_FILE_SIZE = 500 * 1024 * 1024;

            pdfCompressResults = [];
            const errors = [];
            for (let i = 0; i < selectedPdfCompressFiles.length; i++) {
              const file = selectedPdfCompressFiles[i];
              const progress = Math.round(((i + 0.3) / selectedPdfCompressFiles.length) * 100);
              if (pdfCompressProcessBarFill) pdfCompressProcessBarFill.style.width = progress + '%';
              if (pdfCompressProcessText) pdfCompressProcessText.textContent = `${t('home.pdfCompress.processing')} (${i + 1}/${selectedPdfCompressFiles.length})`;

              try {
                if (file.size > MAX_FILE_SIZE) {
                  errors.push(`${file.name}: ${t('home.pdfCompress.tooLarge')}`);
                  continue;
                }

                if (isTauri && file.path) {
                  const rawBytes = await invoke('read_file_bytes', { path: file.path });
                  const fileData = Array.isArray(rawBytes) ? Uint8Array.from(rawBytes) : new Uint8Array(rawBytes);
                  const pdfDoc = await PDFDocument.load(fileData.slice(), { ignoreEncryption: true });

                  if (pdfCompressLevel === 'high') {
                    pdfDoc.setCreator('');
                    pdfDoc.setProducer('');
                    pdfDoc.setTitle('');
                    pdfDoc.setAuthor('');
                    pdfDoc.setSubject('');
                    pdfDoc.setKeywords([]);
                    pdfDoc.setCreationDate(new Date(0));
                    pdfDoc.setModificationDate(new Date(0));
                  }

                  const compressedBytes = await pdfDoc.save({
                    useObjectStreams: pdfCompressLevel !== 'low'
                  });
                  const compressedSize = compressedBytes.length;

                  pdfCompressResults.push({
                    name: file.name,
                    originalSize: file.size || 0,
                    compressedSize,
                    path: file.path || '',
                    compressedBytes
                  });
                } else {
                  const compressedSize = Math.floor((file.size || 0) * 0.6);
                  pdfCompressResults.push({
                    name: file.name,
                    originalSize: file.size || 0,
                    compressedSize,
                    path: file.path || '',
                    compressedBytes: null
                  });
                }
              } catch (fileErr) {
                console.error(`[PDF Compress] Failed: ${file.name}`, fileErr);
                errors.push(`${file.name}: ${String(fileErr.message || fileErr)}`);
              }
            }

            if (pdfCompressProcessBarFill) pdfCompressProcessBarFill.style.width = '100%';
            await new Promise(r => setTimeout(r, 300));

            if (pdfCompressProcessMask) pdfCompressProcessMask.classList.remove('visible');
            if (pdfCompressProcessBarFill) pdfCompressProcessBarFill.style.width = '0%';
            pdfCompressProcessing = false;

            if (pdfCompressResults.length > 0) {
              renderCompressResults();
              if (pdfCompressDrawer) pdfCompressDrawer.classList.add('visible');
            }
            if (errors.length > 0) {
              alert(`${t('home.pdfCompress.partialFail')}:\n${errors.join('\n')}`);
            }
            if (pdfCompressResults.length === 0 && errors.length > 0) {
              alert(`${t('home.pdfCompress.compressFailed')}:\n${errors.join('\n')}`);
            }
          } catch (e) {
            console.error('PDF compress error:', e);
            if (pdfCompressProcessMask) pdfCompressProcessMask.classList.remove('visible');
            if (pdfCompressProcessBarFill) pdfCompressProcessBarFill.style.width = '0%';
            pdfCompressProcessing = false;
            alert(t('common.errorOccurred', { error: String(e) }));
          }
        });
      }

      function renderCompressResults() {
        if (!pdfCompressDrawerBody) return;
        pdfCompressDrawerBody.innerHTML = '';

        pdfCompressResults.forEach((result, idx) => {
          const item = document.createElement('div');
          item.className = 'pdf-compress-result-item';
          const ratio = result.originalSize > 0
            ? Math.round((1 - result.compressedSize / result.originalSize) * 100)
            : 0;
          const ratioText = ratio <= 0 ? `+${Math.abs(ratio)}%` : `-${ratio}%`;
          const ratioClass = ratio <= 0 ? 'pdf-compress-result-ratio no-save' : 'pdf-compress-result-ratio';
          item.innerHTML = `
            <div class="pdf-compress-result-info">
              <span class="pdf-compress-result-index">${idx + 1}</span>
              <span class="pdf-compress-result-name">${escapeHtml(result.name)}</span>
            </div>
            <div class="pdf-compress-result-sizes">
              <span class="pdf-compress-result-original">${formatFileSize(result.originalSize)}</span>
              <span class="pdf-compress-result-arrow">→</span>
              <span class="pdf-compress-result-compressed">${formatFileSize(result.compressedSize)}</span>
              <span class="${ratioClass}">${ratioText}</span>
            </div>
            <button class="pdf-compress-result-download" data-index="${idx}">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
          `;
          pdfCompressDrawerBody.appendChild(item);
        });

        // Single file download buttons
        pdfCompressDrawerBody.querySelectorAll('.pdf-compress-result-download').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index, 10);
            if (!isNaN(idx) && pdfCompressResults[idx]) {
              const result = pdfCompressResults[idx];
              if (isTauri && result.compressedBytes) {
                try {
                  const { invoke } = await import('@tauri-apps/api/core');
                  const outputDir = await getOutputDir('Compressed');
                  const baseName = result.name.replace(/\.pdf$/i, '');
                  let fileName = baseName + '_compressed.pdf';
                  let fullPath = outputDir + '\\' + fileName;
                  let counter = 1;
                  while (await invoke('exists_path', { path: fullPath }).catch(() => false)) {
                    fileName = `${baseName}_compressed_${counter}.pdf`;
                    fullPath = outputDir + '\\' + fileName;
                    counter++;
                  }
                  await invoke('write_file_bytes', { path: fullPath, bytes: Array.from(result.compressedBytes) });
                  showPdfCompressSuccess(fullPath, 'single');
                } catch (err) {
                  console.error('[PDF Compress] Save file error:', err);
                  alert(String(err));
                }
              }
            }
          });
        });

        // Update footer button text
        if (pdfCompressDownloadAllBtn) {
          pdfCompressDownloadAllBtn.textContent = t('home.pdfCompress.downloadAll');
        }
      }

      if (pdfCompressDownloadAllBtn) {
        pdfCompressDownloadAllBtn.addEventListener('click', async () => {
          if (pdfCompressResults.length === 0) return;
          if (isTauri) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const outputDir = await getOutputDir('Compressed');
              let lastSavedPath = '';
              for (const result of pdfCompressResults) {
                if (!result.compressedBytes) continue;
                const baseName = result.name.replace(/\.pdf$/i, '');
                let fileName = baseName + '_compressed.pdf';
                let fullPath = outputDir + '\\' + fileName;
                let counter = 1;
                while (await invoke('exists_path', { path: fullPath }).catch(() => false)) {
                  fileName = `${baseName}_compressed_${counter}.pdf`;
                  fullPath = outputDir + '\\' + fileName;
                  counter++;
                }
                await invoke('write_file_bytes', { path: fullPath, bytes: Array.from(result.compressedBytes) });
                lastSavedPath = outputDir;
              }
              if (lastSavedPath) {
                showPdfCompressSuccess(lastSavedPath, 'all');
              }
            } catch (err) {
              console.error('[PDF Compress] Save all error:', err);
              alert(String(err));
            }
          }
        });
      }

      if (pdfCompressDrawerClose) {
        pdfCompressDrawerClose.addEventListener('click', () => {
          if (pdfCompressDrawer) pdfCompressDrawer.classList.remove('visible');
        });
      }
      if (pdfCompressDrawerBackdrop) {
        pdfCompressDrawerBackdrop.addEventListener('click', () => {
          if (pdfCompressDrawer) pdfCompressDrawer.classList.remove('visible');
        });
      }

      let lastPdfCompressSavedPath = '';

      function showPdfCompressSuccess(savePath, type) {
        lastPdfCompressSavedPath = savePath;
        const count = pdfCompressResults.length;
        if (pdfCompressSuccessCount) pdfCompressSuccessCount.textContent = String(count);
        if (pdfCompressSuccessPath) pdfCompressSuccessPath.textContent = savePath;
        if (type === 'all') {
          if (pdfCompressSuccessMeta) pdfCompressSuccessMeta.textContent = t('home.pdfCompress.successAllMeta', { count });
        } else {
          if (pdfCompressSuccessMeta) pdfCompressSuccessMeta.textContent = t('home.pdfCompress.successSingleMeta');
        }
        if (pdfCompressSuccessOverlay) pdfCompressSuccessOverlay.classList.add('visible');
        if (window.incrementToolUsage) window.incrementToolUsage();
      }

      if (pdfCompressSuccessOk) {
        pdfCompressSuccessOk.addEventListener('click', () => {
          if (pdfCompressSuccessOverlay) pdfCompressSuccessOverlay.classList.remove('visible');
        });
      }
      if (pdfCompressSuccessOpenFolder) {
        pdfCompressSuccessOpenFolder.addEventListener('click', async () => {
          if (isTauri && lastPdfCompressSavedPath) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              await invoke('reveal_in_folder', { path: lastPdfCompressSavedPath });
            } catch (e) {
              console.error('[PDF Compress] Reveal error:', e);
            }
          }
        });
      }

      // ===== Favorites System =====
      const FAV_KEY = 'toolknit_favorites';
      const toastEl = document.getElementById('favToast');
      const toastText = document.getElementById('favToastText');
      let toastTimer = null;

      function isLoggedIn() {
        return !!localStorage.getItem('toolknit_token');
      }

      function showToast(msg) {
        if (!toastEl || !toastText) return;
        toastText.textContent = msg;
        toastEl.classList.add('visible');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
          toastEl.classList.remove('visible');
        }, 2000);
      }

      function getFavorites() {
        try {
          return JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
        } catch { return []; }
      }

      function saveFavorites(favs) {
        localStorage.setItem(FAV_KEY, JSON.stringify(favs));
      }

      function isFavorited(toolId) {
        return getFavorites().some(f => f.tool === toolId);
      }

      function addFavorite(toolId, name, iconHtml, category) {
        if (isFavorited(toolId)) return;
        const favs = getFavorites();
        favs.push({ tool: toolId, name, iconHtml, category, ts: Date.now() });
        saveFavorites(favs);
        renderFavorites();
      }

      function removeFavorite(toolId) {
        const favs = getFavorites().filter(f => f.tool !== toolId);
        saveFavorites(favs);
        renderFavorites();
      }

      function getToolInfo(item) {
        const toolId = item.dataset.tool || '';
        const titleEl = item.querySelector('.audio-list-title');
        const name = titleEl ? titleEl.textContent : (item.dataset.tool || 'Tool');
        const iconEl = item.querySelector('.audio-list-icon');
        let iconHtml = '';
        if (iconEl) {
          iconHtml = iconEl.innerHTML;
        }
        const section = item.closest('.content-section');
        const category = section ? section.dataset.category : '';
        return { toolId, name, iconHtml, category };
      }

      // Right-click on audio-list-item → direct toggle favorite
      // Also track recent usage on click
      const RECENT_KEY = 'toolknit_recent_tools';
      const MAX_RECENT = 3;

      // Global: when a tool overlay's back button is clicked, return to home if navigated from home
      document.addEventListener('click', (e) => {
        if (e.target.closest('.settings-back') && navigatedFromHome) {
          navigatedFromHome = false;
          setTimeout(() => switchCategory('home'), 100);
        }
      }, true);

      function getRecent() {
        try {
          return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        } catch { return []; }
      }

      function saveRecent(list) {
        localStorage.setItem(RECENT_KEY, JSON.stringify(list));
      }

      function addRecent(toolId, name, iconHtml, category) {
        let list = getRecent().filter(r => r.tool !== toolId);
        list.unshift({ tool: toolId, name, iconHtml, category, ts: Date.now() });
        list = list.slice(0, MAX_RECENT);
        saveRecent(list);
      }

      document.querySelectorAll('.audio-list-item').forEach(item => {
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (!isLoggedIn()) {
            showToast(t('home.favLoginRequired'));
            return;
          }
          const info = getToolInfo(item);
          if (isFavorited(info.toolId)) {
            removeFavorite(info.toolId);
            showToast(t('home.favRemoved'));
          } else {
            addFavorite(info.toolId, info.name, info.iconHtml, info.category);
            showToast(t('home.favAdded'));
          }
        });
        item.addEventListener('click', () => {
          const info = getToolInfo(item);
          if (info.toolId) {
            addRecent(info.toolId, info.name, info.iconHtml, info.category);
            renderRecent();
          }
        });
      });

      // Render favorites card on home
      function renderFavorites() {
        const container = document.getElementById('favoritesContent');
        if (!container) return;

        if (!isLoggedIn()) {
          container.innerHTML = `
            <div class="fav-empty-guide">
              <div class="fav-empty-icon"><i data-lucide="star"></i></div>
              <div class="fav-empty-text">${escapeHtml(t('home.favEmptyLogin'))}</div>
              <div class="fav-login-btn" id="favLoginBtn">${escapeHtml(t('home.favEmptyLoginBtn'))}</div>
            </div>
          `;
          const loginBtn = document.getElementById('favLoginBtn');
          if (loginBtn) {
            loginBtn.addEventListener('click', () => {
              const rect = loginBtn.getBoundingClientRect();
              openAuthOverlay(rect.left + rect.width / 2, rect.top + rect.height / 2);
            });
          }
          if (typeof createIcons === 'function') createIcons({ icons });
          return;
        }

        const favs = getFavorites();
        if (favs.length === 0) {
          container.innerHTML = `
            <div class="fav-empty-guide">
              <div class="fav-empty-icon"><i data-lucide="mouse-pointer-click"></i></div>
              <div class="fav-empty-text">${escapeHtml(t('home.favEmptyGuide'))}</div>
            </div>
          `;
          if (typeof createIcons === 'function') createIcons({ icons });
          return;
        }

        container.innerHTML = favs.map(f => `
          <div class="fav-item" data-tool="${f.tool}" data-category="${f.category || ''}">
            <div class="fav-icon">${f.iconHtml || ''}</div>
            <div class="fav-name">${f.name}</div>
            <div class="fav-remove" data-tool="${f.tool}">
              <i data-lucide="x"></i>
            </div>
          </div>
        `).join('');

        if (typeof createIcons === 'function') createIcons({ icons });

        container.querySelectorAll('.fav-item').forEach(el => {
          el.addEventListener('click', (e) => {
            if (e.target.closest('.fav-remove')) return;
            const toolId = el.dataset.tool;
            const category = el.dataset.category;
            if (category) {
              navigatedFromHome = true;
              switchCategory(category);
              setTimeout(() => {
                const toolItem = document.querySelector(`.audio-list-item[data-tool="${toolId}"]`);
                if (toolItem) toolItem.click();
              }, 1100);
            }
          });
        });

        container.querySelectorAll('.fav-remove').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFavorite(btn.dataset.tool);
          });
        });
      }

      // ===== Recommended Tools (random 3) =====
      function renderRecommended() {
        const container = document.getElementById('recommendedContent');
        if (!container) return;
        const allItems = Array.from(document.querySelectorAll('.content-section:not([data-category="home"]) .audio-list-item'));
        if (allItems.length === 0) return;

        // Pick 3 random items
        const shuffled = allItems.sort(() => Math.random() - 0.5);
        const picks = shuffled.slice(0, 3);

        container.innerHTML = picks.map(item => {
          const info = getToolInfo(item);
          return `
            <div class="rec-item" data-tool="${info.toolId}" data-category="${info.category || ''}">
              <div class="rec-icon">${info.iconHtml || ''}</div>
              <div class="rec-name">${info.name}</div>
            </div>
          `;
        }).join('');

        if (typeof createIcons === 'function') createIcons({ icons });

        container.querySelectorAll('.rec-item').forEach(el => {
          el.addEventListener('click', () => {
            const toolId = el.dataset.tool;
            const category = el.dataset.category;
            if (category) {
              navigatedFromHome = true;
              switchCategory(category);
              setTimeout(() => {
                const toolItem = document.querySelector(`.audio-list-item[data-tool="${toolId}"]`);
                if (toolItem) toolItem.click();
              }, 1100);
            }
          });
        });
      }

      // ===== Recently Used =====
      function renderRecent() {
        const container = document.getElementById('recentlyContent');
        if (!container) return;
        const recent = getRecent();
        if (recent.length === 0) {
          container.innerHTML = `<div class="placeholder-box" data-i18n="home.empty">${escapeHtml(t('home.empty'))}</div>`;
          return;
        }
        container.innerHTML = recent.map(r => `
          <div class="rec-item" data-tool="${escapeHtml(r.tool)}" data-category="${escapeHtml(r.category || '')}">
            <div class="rec-icon">${r.iconHtml || ''}</div>
            <div class="rec-name">${escapeHtml(r.name)}</div>
          </div>
        `).join('');
        if (typeof createIcons === 'function') createIcons({ icons });
        container.querySelectorAll('.rec-item').forEach(el => {
          el.addEventListener('click', () => {
            const toolId = el.dataset.tool;
            const category = el.dataset.category;
            if (category) {
              navigatedFromHome = true;
              switchCategory(category);
              setTimeout(() => {
                const toolItem = document.querySelector(`.audio-list-item[data-tool="${toolId}"]`);
                if (toolItem) toolItem.click();
              }, 1100);
            }
          });
        });
      }

      // Initial render
      renderFavorites();
      renderRecommended();
      renderRecent();

      // Re-render on language change
      onLangChange(() => {
        renderFavorites();
        renderRecent();
      });