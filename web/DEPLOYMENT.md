# Deploy Nuvio Enhanced Web

## GitHub Pages

The web build is entirely static. GitHub serves the app assets; video travels directly from your provider to your device. The app supports both repository subpaths and root/custom domains using relative assets and hash navigation.

1. Create your GitHub fork of [Nuvio Mobile Enhanced](https://github.com/yesnt10/NuvioMobile-Enhanced/fork). Disable “Copy the enhanced branch only” if you want all upstream branches; only your web branch is needed for the website.
2. Push this local `web-enhanced-pages` branch, including the web changes, to **your** fork. The local `origin` currently points at NuvioMedia upstream; do not push there. Add a new remote for your fork instead. Replace the placeholders below:

   ```sh
   git add web .github/workflows/web-pages.yml README.md
   git commit -m "Add Nuvio Enhanced web app and Pages deployment"
   git remote add myfork https://github.com/YOUR_USERNAME/YOUR_FORK.git
   git push -u myfork web-enhanced-pages
   ```

3. In your fork, set `web-enhanced-pages` as the default branch (Settings → General → Default branch). This also makes the manual workflow dispatch easy to find.
4. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**. Enable Actions for the fork if GitHub prompts you. For this fork's inherited native workflows, keep release secrets unset and disable any you do not intend to run.
5. In **Actions → Web app — test and deploy**, run the workflow on `web-enhanced-pages`. The workflow tests the app before publishing `web/dist`.
6. Use the URL reported by the deployment. It is normally `https://YOUR_USERNAME.github.io/YOUR_FORK/`. Enter your IPTV login in Settings and test on your iPhone/iPad.

If you choose another branch name, change the push branch in [web-pages.yml](../.github/workflows/web-pages.yml). The deployment job needs Pages enabled; it cannot create your GitHub fork or change account settings on its own.

The workflow sets `VITE_SOURCE_URL` to your fork's web source so the deployed app links to its corresponding source. This is a public source-code URL, never an IPTV secret. For a manual deployment, set it before building.

## Custom domain

Use GitHub's custom-domain support rather than an iframe or masked URL forwarding. You can add the domain after verifying playback on the default GitHub URL.

1. Add your chosen domain in **Settings → Pages → Custom domain**.
2. For a subdomain such as `watch.example.com`, create a DNS **CNAME** record named `watch` targeting `YOUR_USERNAME.github.io` (without a scheme or repository path).
3. For a root domain, use the current A/ALIAS/ANAME instructions in [GitHub's custom-domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
4. After DNS validation and certificate issuance, enable **Enforce HTTPS**. DNS and certificates can take time even if buying the domain is immediate.
5. Open the custom-domain address on the device and log in again. Browser storage is isolated by origin: your old github.io settings do not migrate automatically.

For this Actions deployment, GitHub does not require a repository `CNAME` file. Domain settings live in Pages settings.

### TikTak TV production records

The production site uses `www.tiktaktv.me` as its GitHub Pages custom domain, with `tiktaktv.me` redirected to it. Configure these records at IONOS and remove any parking/forwarding record for the same host first:

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `zachgus33.github.io` |

GitHub redirects `tiktaktv.me` to the `www` custom domain once the root records resolve. After GitHub provisions the certificate, enable **Enforce HTTPS** in repository **Settings > Pages**. Keep `play.tiktaktv.me` unused until the permanent Cloudflare Tunnel is configured; it must not point at GitHub Pages.

## iPhone / iPad acceptance checks

- Safari: connect, load categories, select a live channel, tap Watch channel.
- Verify picture and sound, rotation, fullscreen, background/foreground recovery, and channel switching.
- Try one movie and one episode. Test seek and resume after closing the player.
- Try AirPlay and Picture in Picture with a compatible receiver/device.
- Add to Home Screen and repeat login/playback in standalone mode.
- Test Wi-Fi and cellular, and reconnect after a network interruption.
- Confirm the provider permits the number of simultaneous sessions you use. Closing the player releases its video/HLS resources.

## Diagnosing a failure

| Symptom | What to check |
| --- | --- |
| Test & connect returns HTTP 401/403/511 | Account details, provider restrictions, or an incorrect server/port. |
| Cannot reach source / CORS | Provider response headers must allow your deployed origin. A new host or domain does not automatically bypass CORS. |
| Login works, video fails | Stream HTTPS redirects, media-origin permissions, HLS support, codec compatibility, account connection limits. |
| Cinemeta titles have no streams | Cinemeta supplies metadata. Install your own HTTPS stream add-on. |
| Torrent/MKV source is disabled or fails | Browser playback is not a native torrent/MPV engine. Choose an available MP4/HLS source or use a separately hosted media server. |
| HTTPS site points to an HTTP stream | Request an HTTPS stream endpoint from the provider. This app intentionally rejects insecure sources. |

## Hosting alternatives

The same `web/dist` output can be hosted on any HTTPS static host. If your provider requires a relay, a real server is needed in addition to this frontend. Oracle Always Free is one possible VM host; availability, account verification, idle reclamation and resource limits apply. No relay or transcoder is included in this static build. Do not deploy an unauthenticated public proxy.

Official references checked during development:

- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [Oracle Always Free limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Render free service limits](https://render.com/docs/free)
