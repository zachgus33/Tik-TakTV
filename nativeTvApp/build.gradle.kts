plugins {
    alias(libs.plugins.androidApplication)
}

val tvReleaseStoreFile = providers.environmentVariable("TIKTAK_TV_KEYSTORE_FILE")
val tvReleaseStorePassword = providers.environmentVariable("TIKTAK_TV_STORE_PASSWORD")
val tvReleaseKeyAlias = providers.environmentVariable("TIKTAK_TV_KEY_ALIAS")
val tvReleaseKeyPassword = providers.environmentVariable("TIKTAK_TV_KEY_PASSWORD")
val hasTvReleaseSigning = listOf(
    tvReleaseStoreFile,
    tvReleaseStorePassword,
    tvReleaseKeyAlias,
    tvReleaseKeyPassword,
).all { it.isPresent }

android {
    namespace = "com.tiktaktv.nativepreview"
    compileSdk = libs.versions.android.compileSdk.get().toInt()
    compileSdkMinor = libs.versions.android.compileSdkMinor.get().toInt()

    defaultConfig {
        applicationId = "com.tiktaktv.tv.nativepreview"
        minSdk = 24
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 75
        versionName = "0.3.65"
        buildConfigField("boolean", "ENABLE_SIDELOAD_UPDATES", "true")
        buildConfigField(
            "String",
            "UPDATE_METADATA_URL",
            "\"https://github.com/zachgus33/Tik-TakTV/releases/download/native-preview-latest/tiktak-tv-native-preview.json\"",
        )
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("tvRelease") {
            if (hasTvReleaseSigning) {
                storeFile = file(tvReleaseStoreFile.get())
                storePassword = tvReleaseStorePassword.get()
                keyAlias = tvReleaseKeyAlias.get()
                keyPassword = tvReleaseKeyPassword.get()
                storeType = "PKCS12"
            }
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = true
            // Fire OS caches launcher banner/icon resource paths across in-place
            // updates. Resource shrinking renames those files on every release,
            // leaving an existing launcher tile pointing at a missing path.
            // Keep the release minified, but preserve packaged resource names.
            isShrinkResources = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "../composeApp/proguard-rules.pro",
            )
            if (hasTvReleaseSigning) {
                signingConfig = signingConfigs.getByName("tvRelease")
            }
        }
        create("appstore") {
            initWith(getByName("release"))
            matchingFallbacks += listOf("release")
            buildConfigField("boolean", "ENABLE_SIDELOAD_UPDATES", "false")
        }
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
        jniLibs {
            useLegacyPackaging = true
            pickFirsts += listOf(
                "lib/*/libc++_shared.so",
                "lib/*/libavcodec.so",
                "lib/*/libavutil.so",
                "lib/*/libswscale.so",
                "lib/*/libswresample.so",
            )
        }
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(project(":composeApp"))
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.ktx)
    implementation(libs.compose.foundation)
    implementation(libs.compose.runtime)
    coreLibraryDesugaring(libs.desugar.jdk.libs)
    debugImplementation(libs.compose.uiTooling)
    testImplementation(libs.junit)
}
