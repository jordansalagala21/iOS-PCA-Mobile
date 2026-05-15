import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthStackParamList } from "../../navigation/AuthNavigator";
import { auth, db } from "../../services/firebase";

type Props = NativeStackScreenProps<AuthStackParamList, "Signup">;

function toUserMessage(code: string): string {
  const map: Record<string, string> = {
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/invalid-email": "Invalid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/operation-not-allowed":
      "Email/password sign-in is not enabled. Enable it in the Firebase Console → Authentication → Sign-in methods.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/invalid-api-key":
      "Invalid Firebase API key. Check your firebase config.",
  };
  if (!map[code]) {
    console.error("[SignupScreen] Unhandled Firebase error:", code);
  }
  return map[code] ?? `Something went wrong (${code}). Please try again.`;
}

export function SignupScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [linked, setLinked] = useState(false);

  const handleSignup = async () => {
    if (!fullName.trim() || !email.trim() || !password || !phone.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password,
      );
      await updateProfile(credential.user, { displayName: fullName.trim() });

      // Check for an existing walk-in record with the same phone number
      const walkInSnap = await getDocs(
        query(
          collection(db, "users"),
          where("phone", "==", phone.trim()),
          where("accountType", "==", "walk-in"),
        ),
      );
      const walkInDoc = walkInSnap.docs.find((d) => d.data().uid === null);

      if (walkInDoc) {
        // Link: migrate appointments to new auth uid, then update walk-in doc
        const apptSnap = await getDocs(
          query(
            collection(db, "appointments"),
            where("customerId", "==", walkInDoc.id),
          ),
        );
        if (!apptSnap.empty) {
          const batch = writeBatch(db);
          apptSnap.docs.forEach((d) =>
            batch.update(d.ref, { customerId: credential.user.uid }),
          );
          await batch.commit();
        }
        await updateDoc(doc(db, "users", walkInDoc.id), {
          uid: credential.user.uid,
          accountType: "linked",
        });
        // Create the canonical /users/{auth.uid} document
        await setDoc(doc(db, "users", credential.user.uid), {
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          vehicleMake: vehicleMake.trim(),
          vehicleModel: vehicleModel.trim(),
          role: "customer",
          accountType: "linked",
          linkedFrom: walkInDoc.id,
          createdAt: serverTimestamp(),
        });
        setLinked(true);
      } else {
        await setDoc(doc(db, "users", credential.user.uid), {
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          vehicleMake: vehicleMake.trim(),
          vehicleModel: vehicleModel.trim(),
          role: "customer",
          createdAt: serverTimestamp(),
        });
      }
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? "";
      setError(toUserMessage(code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Image
              source={require("../../../assets/icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.appName}>Create Account</Text>
            <Text style={styles.tagline}>Join Perfect Choice today</Text>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Personal Info</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="John Smith"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="words"
                autoComplete="name"
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email *</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Phone *</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="(555) 000-0000"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                autoComplete="tel"
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password *</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 6 characters"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
                autoComplete="new-password"
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Confirm Password *</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
                returnKeyType="next"
              />
            </View>

            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>Your Vehicle</Text>

            <View style={styles.row}>
              <View style={[styles.field, styles.flex1, { marginRight: 10 }]}>
                <Text style={styles.label}>Make</Text>
                <TextInput
                  style={styles.input}
                  value={vehicleMake}
                  onChangeText={setVehicleMake}
                  placeholder="Toyota"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              <View style={[styles.field, styles.flex1]}>
                <Text style={styles.label}>Model</Text>
                <TextInput
                  style={styles.input}
                  value={vehicleModel}
                  onChangeText={setVehicleModel}
                  placeholder="Camry"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={handleSignup}
                />
              </View>
            </View>

            {linked && (
              <View style={styles.linkedBanner}>
                <Text style={styles.linkedBannerText}>
                  Welcome back! We found your visit history and linked it to
                  your new account.
                </Text>
              </View>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("Login")}
              activeOpacity={0.7}
            >
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 32,
    backgroundColor: "#FFFFFF",
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 16,
  },
  appName: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0A0A0A",
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: 14,
    color: "#E09010",
    marginTop: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 20,
  },
  field: {
    marginBottom: 16,
  },
  flex1: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#0A0A0A",
  },
  linkedBanner: {
    backgroundColor: "#D1FAE5",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#6EE7B7",
  },
  linkedBannerText: {
    fontSize: 13,
    color: "#065F46",
    fontWeight: "600",
    lineHeight: 18,
  },
  errorText: {
    fontSize: 13,
    color: "#DC2626",
    marginBottom: 16,
    marginTop: -4,
  },
  button: {
    backgroundColor: "#E09010",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#E09010",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },
  footerText: {
    fontSize: 14,
    color: "#6B7280",
  },
  footerLink: {
    fontSize: 14,
    fontWeight: "700",
    color: "#E09010",
  },
});
