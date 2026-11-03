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
    namespace = "com.tiktaktv.tv"
    compileSdk = libs.versions.android.compileSdk.get().toInt()
    compileSdkMinor = libs.versions.android.compileSdkMinor.get().toInt()

    defaultConfig {
        applicationId = "com.tiktaktv.tv"
        minSdk = 24
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 4
        versionName = "0.3.1"
        buildConfigField("String", "START_URL", "\"https://www.tiktaktv.me/?tv=1\"")
        buildConfigField(
            "String",
            "UPDATE_METADATA_URL",
            "\"https://github.com/zachgus33/Tik-TakTV/releases/download/tv-latest/tiktak-tv-android-tv.json\"",
        )
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            if (hasTvReleaseSigning) {
                signingConfig = signingConfigs.getByName("tvRelease")
            }
        }
    }
}

dependencies {
    implementation(libs.androidx.activity)
    implementation(libs.androidx.core.ktx)
    testImplementation(libs.junit)
}
