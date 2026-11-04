plugins {
    alias(libs.plugins.androidApplication)
}

val mobileReleaseStoreFile = providers.environmentVariable("TIKTAK_MOBILE_KEYSTORE_FILE")
val mobileReleaseStorePassword = providers.environmentVariable("TIKTAK_MOBILE_STORE_PASSWORD")
val mobileReleaseKeyAlias = providers.environmentVariable("TIKTAK_MOBILE_KEY_ALIAS")
val mobileReleaseKeyPassword = providers.environmentVariable("TIKTAK_MOBILE_KEY_PASSWORD")
val hasMobileReleaseSigning = listOf(
    mobileReleaseStoreFile,
    mobileReleaseStorePassword,
    mobileReleaseKeyAlias,
    mobileReleaseKeyPassword,
).all { it.isPresent }

android {
    namespace = "com.tiktaktv.mobile"
    compileSdk = libs.versions.android.compileSdk.get().toInt()
    compileSdkMinor = libs.versions.android.compileSdkMinor.get().toInt()

    defaultConfig {
        applicationId = "com.tiktaktv.mobile"
        minSdk = 24
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "START_URL", "\"https://www.tiktaktv.me/?app=android\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures { buildConfig = true }

    signingConfigs {
        create("mobileRelease") {
            if (hasMobileReleaseSigning) {
                storeFile = file(mobileReleaseStoreFile.get())
                storePassword = mobileReleaseStorePassword.get()
                keyAlias = mobileReleaseKeyAlias.get()
                keyPassword = mobileReleaseKeyPassword.get()
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
            if (hasMobileReleaseSigning) signingConfig = signingConfigs.getByName("mobileRelease")
        }
    }
}

dependencies {
    implementation(libs.androidx.activity)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    testImplementation(libs.junit)
}
