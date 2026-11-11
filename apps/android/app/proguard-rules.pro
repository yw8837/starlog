# R8 rules for the release build.
#
# No app-specific rules are needed: the shell uses no reflection, and the SDKs it depends on
# (Play Billing, Google Mobile Ads, UMP, androidx.webkit, androidx.credentials incl. the
# play-services-auth provider, googleid) ship their own consumer R8 rules inside their AARs.
# The release build check in README.md confirms the Credential Manager Play Services provider
# survives shrinking (it is looked up by class name at runtime).

# Keep file/line info so Play Console crash reports can be de-obfuscated with the mapping file.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
