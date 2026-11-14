
// SAANJHATHAAL - Firebase Authentication and Application

// Firebase SDK imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
  collection,
  addDoc,
  getDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  runTransaction
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const $ = (id) => document.getElementById(id);

// Display current year
$("year").textContent = new Date().getFullYear();

console.log("SaanjhaThaal connected to Firebase!");

// Authentication dialog
const authDialog = $("authDialog");
let isRegister = false;

$("authOpen").addEventListener("click", () => {
  isRegister = false;
  updateAuthDialog();
  authDialog.showModal();
});

$("authClose").addEventListener("click", () => {
  authDialog.close();
});

$("switchAuth").addEventListener("click", () => {
  isRegister = !isRegister;
  updateAuthDialog();
});

function updateAuthDialog() {
  $("authTitle").textContent = isRegister
    ? "Create your account"
    : "Sign In";

  $("authSubmit").textContent = isRegister
    ? "Create Account"
    : "Sign In";

  $("nameWrap").hidden = !isRegister;
  $("roleWrap").hidden = !isRegister;

  $("switchText").textContent = isRegister
    ? "Already registered?"
    : "New to SaanjhaThaal?";
  $("switchAuth").textContent = isRegister
    ? "Sign In"
    : "Create an account";

  $("authForm").elements.displayName.required = isRegister;
}

// Friendly Firebase error messages
function getErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "This email is already registered. Please sign in.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must contain at least 6 characters.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/network-request-failed": "Network error. Check your internet connection."
  };

  return messages[error.code] || error.message;
}

// Registration and Sign In
$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  const message = $("authMessage");

  const submitButton = $("authSubmit");
  submitButton.disabled = true;
  message.textContent = "Please wait...";

  try {
    if (isRegister) {
      const displayName = form.elements.displayName.value.trim();
      const role = form.elements.role.value;

      // Create Firebase Authentication account
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = userCredential.user;

      // Save user's display name
      await updateProfile(user, {
        displayName: displayName
      });

      // Create user profile in Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        displayName: displayName,
        email: email,
        role: role,
        verificationStatus: role === "ngo" ? "pending" : "not_required",
        createdAt: serverTimestamp()
      });

      message.textContent =
        role === "ngo"
          ? "Account created! Your NGO verification is pending."
          : "Account created successfully! You are now signed in.";

      console.log("New SaanjhaThaal user registered:", user.uid);
      form.reset();
      isRegister = false;
      updateAuthDialog();
      message.textContent = "";
    } else {
      // Sign in existing user
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      message.textContent = "Signed in successfully!";
      console.log("User signed in:", userCredential.user.uid);

      authDialog.close();
    }

  } catch (error) {
    console.error("Authentication error:", error);
    message.textContent = getErrorMessage(error);

  } finally {
    submitButton.disabled = false;
  }
});

// Observe authentication state
onAuthStateChanged(auth, async (user) => {
  const authButton = $("authOpen");
  const logoutButton = $("logoutBtn");
  const userInfo = $("userInfo");

  if (authButton) authButton.hidden = !!user;
  if (logoutButton) logoutButton.hidden = !user;
  if (userInfo) userInfo.hidden = !user;
  console.log("AUTH LISTENER RUNNING. Current user:", user);  
  const ngoDashboard = $("ngoDashboard");
  const donorDashboard = $("donorDashboard");
  const statusMessage = $("ngoStatusMessage");

  ngoDashboard.hidden = true;
  donorDashboard.hidden = true;
  statusMessage.hidden = true;

  if (!user) {
    console.log("No user is signed in.");
    return;
  }

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      console.error("User profile not found.");
      return;
    }

    const profile = userSnap.data();
    userInfo.textContent =
    profile.displayName + " (" + profile.role.toUpperCase() + ")";

    if (profile.role === "ngo") {
      if (String(profile.verificationStatus || "").trim() !== "verified") {
        statusMessage.hidden = false;
        statusMessage.textContent =
          "Your NGO account is awaiting verification. You can access the rescue dashboard after approval.";
        return;
      }

      ngoDashboard.hidden = false;
      loadNgoBoard();
      loadAcceptedRescues();
      loadCompletedRescues();
      console.log("Verified NGO signed in.");
    } else if (profile.role === "donor") {
      donorDashboard.hidden = false;
      loadDonorDashboard();
      console.log("Donor signed in.");
    }
  } catch (error) {
    console.error("User profile error:", error);
  }
});
// Donation form - Firebase publishing will be added next
// Publish donation to Firestore
// Publish donation to Firestore
$("donationForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const message = $("donationMessage");
  const button = form.querySelector('button[type="submit"]');

  if (!auth.currentUser) {
    message.textContent = "Please sign in before publishing a donation.";
    return;
  }

  button.disabled = true;
  message.textContent = "Publishing donation...";

  try {
    const donorId = auth.currentUser.uid;

    // Verify donor account
    const userRef = doc(db, "users", donorId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists() || userSnap.data().role !== "donor") {
      throw new Error("Only food donors can publish donations.");
    }

    // Collect form information
    const foodName = form.elements.foodName.value.trim();
    const quantity = Number(form.elements.quantity.value);
    const unit = form.elements.unit.value;
    const category = form.elements.category.value;
    const preparedAt = form.elements.preparedAt.value;
    const deadline = form.elements.deadline.value;
    const storage = form.elements.storage.value;
    const pickupArea = form.elements.location.value.trim();

    const contactName = form.elements.contactName.value.trim();
    const phone = form.elements.phone.value.trim();

    // Validate information
    if (
      !foodName || !category || !preparedAt || !deadline ||
      !storage || !pickupArea || !contactName || !phone ||
      !Number.isFinite(quantity) || quantity <= 0
    ) {
      throw new Error("Please complete all donation fields correctly.");
    }

    if (new Date(deadline) <= new Date()) {
      throw new Error("Pickup deadline must be in the future.");
    }

    // Create a batch
    const batch = writeBatch(db);

    // Generate donation document reference
    const donationRef = doc(collection(db, "donations"));

    // Public donation information
    batch.set(donationRef, {
      foodName,
      quantity,
      unit,
      category,
      preparedAt,
      pickupDeadline: deadline,
      storageMethod: storage,
      pickupArea,
      donorId,
      status: "available",
      foodSafetyStatus: "pending_review",
      createdAt: serverTimestamp()
    });

    // Private donor contact information
    const privateRef = doc(db, "donationPrivate", donationRef.id);

    batch.set(privateRef, {
      donorId,
      contactName,
      phone,
      createdAt: serverTimestamp()
    });

    // Save both documents together
    await batch.commit();

    message.textContent =
      "Donation and private contact details saved successfully!";

    form.reset();

  } catch (error) {
    console.error("Donation error:", error);
    message.textContent =
      error.message || "Unable to publish donation.";
  } finally {
    button.disabled = false;
  }
});
// SAANJHATHAAL LIVE FOOD BOARD

const listingGrid = $("listingGrid");
let unsubscribeFoodBoard = null;

function loadFoodBoard() {

  listingGrid.textContent = "Loading available food donations...";

  // Stop the previous listener if one exists
  if (unsubscribeFoodBoard) {
    unsubscribeFoodBoard();
  }

  // Listen only to available donations
  const donationsQuery = query(
    collection(db, "donations"),
    where("status", "==", "available")
  );

  unsubscribeFoodBoard = onSnapshot(
    donationsQuery,

    (snapshot) => {
      listingGrid.innerHTML = "";

      if (snapshot.empty) {
        listingGrid.textContent = "No food donations available right now.";
        return;
      }

      snapshot.forEach(async (documentSnapshot) => {

        const donation = documentSnapshot.data();

        // Create a food card safely
        const card = document.createElement("article");
        card.className = "food-card";

        const heading = document.createElement("h3");
        heading.textContent = donation.foodName || "Food donation";

        const category = document.createElement("p");
        category.textContent = "Category: " + (donation.category || "Not specified");

        const quantity = document.createElement("p");
        quantity.textContent = "Quantity: " + donation.quantity;

        const area = document.createElement("p");
        area.textContent = "Pickup area: " + (donation.pickupArea || "Not specified");

        const deadline = document.createElement("p");
        deadline.textContent = "Pickup deadline: " +
          (donation.pickupDeadline || "Not specified");

        const status = document.createElement("p");
        status.textContent = "Status: Available";

        card.append(
          heading,
          category,
          quantity,
          area,
          deadline,
          status
        );

        listingGrid.appendChild(card);
      });
    },

    (error) => {
      console.error("Food Board error:", error);
      listingGrid.textContent =
        "Unable to load food donations. Please try again.";
    }
  );
}

// Load the board automatically
loadFoodBoard();

// Manual refresh button
$("refreshListings").addEventListener("click", loadFoodBoard);
// NGO LIVE RESCUE OPPORTUNITIES

const ngoListingGrid = $("ngoListingGrid");
let unsubscribeNgoBoard = null;

function loadNgoBoard() {
  if (unsubscribeNgoBoard) unsubscribeNgoBoard();

  ngoListingGrid.textContent = "Loading rescue opportunities...";

  const ngoQuery = query(
    collection(db, "donations"),
    where("status", "==", "available")
  );

  unsubscribeNgoBoard = onSnapshot(
    ngoQuery,
    (snapshot) => {
      ngoListingGrid.innerHTML = "";

      if (snapshot.empty) {
        ngoListingGrid.textContent =
          "No rescue opportunities available right now.";
        return;
      }

      snapshot.forEach((documentSnapshot) => {
        const donation = documentSnapshot.data();

        const card = document.createElement("article");
        card.className = "food-card";

        const heading = document.createElement("h3");
        heading.textContent = donation.foodName || "Food donation";

        const quantity = document.createElement("p");
        quantity.textContent = "Quantity: " + donation.quantity;

        const category = document.createElement("p");
        category.textContent = "Category: " + donation.category;

        const area = document.createElement("p");
        area.textContent = "Pickup area: " + donation.pickupArea;

        const deadline = document.createElement("p");
        deadline.textContent =
          "Pickup deadline: " + donation.pickupDeadline;

        const acceptButton = document.createElement("button");
        acceptButton.textContent = "Accept Donation";
        acceptButton.type = "button";

        acceptButton.addEventListener("click", async () => {
          if (!auth.currentUser) {
            alert("Please sign in first.");
            return;
          }

          acceptButton.disabled = true;
          acceptButton.textContent = "Accepting...";

          try {
            const donationRef = doc(
              db,
              "donations",
              documentSnapshot.id
            );

            await runTransaction(db, async (transaction) => {
              const donationSnap = await transaction.get(donationRef);

              if (!donationSnap.exists()) {
                throw new Error("This donation no longer exists.");
              }

              if (donationSnap.data().status !== "available") {
                throw new Error(
                  "Sorry! This donation has already been accepted."
                );
              }

              transaction.update(donationRef, {
                status: "accepted",
                assignedNgoId: auth.currentUser.uid,
                assignedAt: serverTimestamp()
              });
            });

            alert("Donation accepted successfully!");
          } catch (error) {
            console.error("Accept donation error:", error);
            alert(error.message || "Unable to accept donation.");
            acceptButton.disabled = false;
            acceptButton.textContent = "Accept Donation";
          }
        });

        card.append(
          heading,
          quantity,
          category,
          area,
          deadline,
          acceptButton
        );

        ngoListingGrid.appendChild(card);
      });
    },
    (error) => {
      console.error("NGO dashboard error:", error);
      ngoListingGrid.textContent =
        "Unable to load rescue opportunities.";
    }
  );
}

function loadDonorDashboard() {
  const donorId = auth.currentUser.uid;

  const donationsQuery = query(
    collection(db, "donations"),
    where("donorId", "==", donorId)
  );

  const donorDonationGrid = $("donorDonationGrid");

  onSnapshot(
    donationsQuery,
    (snapshot) => {
      const donations = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      const total = donations.length;
      const available = donations.filter(
        (d) => d.status === "available"
      ).length;

      const inProgress = donations.filter(
        (d) => ["accepted", "picked_up"].includes(d.status)
      ).length;

      const completed = donations.filter(
        (d) => d.status === "completed"
      ).length;

      $("donorTotal").textContent = total;
      $("donorAvailable").textContent = available;
      $("donorInProgress").textContent = inProgress;
      $("donorCompleted").textContent = completed;

      if (donations.length === 0) {
        donorDonationGrid.innerHTML =
          "<p>You haven't published any food donations yet.</p>";
        return;
      }

      donorDonationGrid.innerHTML = donations.map((d) => `
        <article class="donation-card">
          <h3>${escapeHtml(d.foodName || "Food donation")}</h3>
          <p>Quantity: ${Number(d.quantity) || 0} ${escapeHtml(d.unit || "")}</p>
          <p>Category: ${escapeHtml(d.category || "Not specified")}</p>
          <p>Location: ${escapeHtml(d.pickupArea || "Not specified")}</p>
          <p>Status: <strong>${escapeHtml(d.status || "Unknown")}</strong></p>
        </article>
      `).join("");
    },
    (error) => {
      console.error("Donor dashboard error:", error);
      donorDonationGrid.innerHTML =
        "<p>Unable to load your donations. Please try again.</p>";
    }
  );
}


// NGO ACCEPTED RESCUES

const acceptedRescueGrid = $("acceptedRescueGrid");
const completedRescueGrid = $("completedRescueGrid");
const statDonations = $("statDonations");
const statRescued = $("statRescued");
const statMeals = $("statMeals");

let unsubscribeCompletedRescues = null;
let unsubscribeAcceptedRescues = null;



function loadAcceptedRescues() {
  if (!auth.currentUser || !acceptedRescueGrid) return;

  if (unsubscribeAcceptedRescues) {
    unsubscribeAcceptedRescues();
  }

  const acceptedQuery = query(
    collection(db, "donations"),
    where("assignedNgoId", "==", auth.currentUser.uid)
  );

  unsubscribeAcceptedRescues = onSnapshot(
    acceptedQuery,
    (snapshot) => {
      acceptedRescueGrid.innerHTML = "";

      const activeRescues = snapshot.docs.filter((item) =>
        ["accepted", "picked_up"].includes(item.data().status)
      );

      if (activeRescues.length === 0) {
        acceptedRescueGrid.textContent =
          "No active rescues yet.";
        return;
      }

      activeRescues.forEach((documentSnapshot) => {
        const donation = documentSnapshot.data();

        const card = document.createElement("article");
        card.className = "food-card";

        const heading = document.createElement("h3");
        heading.textContent = donation.foodName || "Food donation";

        const quantity = document.createElement("p");
        quantity.textContent = "Quantity: " + donation.quantity;

        const area = document.createElement("p");
        area.textContent = "Pickup area: " + donation.pickupArea;

        const status = document.createElement("p");
        status.textContent =
          "Status: " + donation.status.replace("_", " ").toUpperCase();

        card.append(heading, quantity, area, status);

        const actionButton = document.createElement("button");
        actionButton.type = "button";

        const currentStatus = donation.status;

        if (currentStatus === "accepted") {
          actionButton.textContent = "Confirm Pickup";
        } else {
          actionButton.textContent = "Confirm Distribution";
        }

        actionButton.addEventListener("click", async () => {
          const nextStatus =
            currentStatus === "accepted" ? "picked_up" : "completed";

          const question =
            currentStatus === "accepted"
              ? "Has the food been physically collected from the donor?"
              : "Has the food been distributed to people in need?";

          if (!confirm(question)) return;

          actionButton.disabled = true;
          actionButton.textContent = "Updating...";

          try {
            const donationRef = doc(
              db,
              "donations",
              documentSnapshot.id
            );

            await runTransaction(db, async (transaction) => {
              const donationSnap = await transaction.get(donationRef);

              if (!donationSnap.exists()) {
                throw new Error("Donation not found.");
              }

              const currentDonation = donationSnap.data();

              if (
                currentDonation.status !== currentStatus ||
                currentDonation.assignedNgoId !== auth.currentUser.uid
              ) {
                throw new Error("This donation cannot be updated.");
              }

              if (nextStatus === "picked_up") {
                transaction.update(donationRef, {
                  status: "picked_up",
                  pickedUpAt: serverTimestamp()
                });
              } else {
                transaction.update(donationRef, {
                  status: "completed",
                  completedAt: serverTimestamp()
                });
              }
            });

            alert(
              nextStatus === "picked_up"
                ? "Pickup confirmed successfully!"
                : "Food distribution completed successfully!"
            );
          } catch (error) {
            console.error("Rescue update error:", error);
            alert(error.message || "Unable to update rescue.");
            actionButton.disabled = false;
            actionButton.textContent =
              currentStatus === "accepted"
                ? "Confirm Pickup"
                : "Confirm Distribution";
          }
        });

        card.appendChild(actionButton);
        acceptedRescueGrid.appendChild(card);
      });
    },
    (error) => {
      console.error("Accepted rescues error:", error);
      acceptedRescueGrid.textContent =
        "Unable to load accepted rescues.";
    }
  );
}
function loadCompletedRescues() {
  if (!auth.currentUser || !completedRescueGrid) return;

  if (unsubscribeCompletedRescues) {
    unsubscribeCompletedRescues();
  }

  const completedQuery = query(
    collection(db, "donations"),
    where("assignedNgoId", "==", auth.currentUser.uid)
  );

  unsubscribeCompletedRescues = onSnapshot(
    completedQuery,
    (snapshot) => {
      completedRescueGrid.innerHTML = "";

      const completedRescues = snapshot.docs.filter(
        (item) => item.data().status === "completed"
      );

      if (completedRescues.length === 0) {
        completedRescueGrid.textContent = "No completed rescues yet.";
        return;
      }

      completedRescues.forEach((documentSnapshot) => {
        const donation = documentSnapshot.data();

        const card = document.createElement("article");
        card.className = "food-card";

        const heading = document.createElement("h3");
        heading.textContent = donation.foodName || "Food Donation";

        const quantity = document.createElement("p");
        quantity.textContent = `Quantity: ${donation.quantity || "N/A"}`;

        const area = document.createElement("p");
        area.textContent = `Pickup Area: ${donation.pickupArea || "N/A"}`;

        const status = document.createElement("p");
        status.textContent = "Status: Completed";

        const date = document.createElement("p");
        date.textContent = donation.completedAt
          ? `Completed on: ${donation.completedAt.toDate().toLocaleString()}`
          : "Completion date unavailable";

        card.append(heading, quantity, area, status, date);
        completedRescueGrid.appendChild(card);
      });
    },
    (error) => {
      console.error("Completed rescues error:", error);
      completedRescueGrid.textContent =
        "Unable to load completed rescues.";
    }
  );
}
function loadImpactDashboard() {
  const statsRef = doc(db, "impactStats", "global");

  onSnapshot(
    statsRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        console.warn("Impact statistics document not found.");
        return;
      }

      const stats = snapshot.data();

      statDonations.textContent = stats.totalDonations ?? 0;
      statRescued.textContent = stats.completedRescues ?? 0;
      statMeals.textContent = stats.estimatedMeals ?? 0;
    },
    (error) => {
      console.error("Impact dashboard error:", error);
    }
  );
}loadImpactDashboard();
console.log("SaanjhaThaal Live Food Board initialized.");
console.log("SaanjhaThaal application initialized successfully.");
$("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    $("authMessage").textContent = "";
  } catch (error) {
    console.error("Sign out error:", error);
    alert("Unable to sign out. Please try again.");
  }
});
