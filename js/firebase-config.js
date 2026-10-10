// Configuration Firebase pour synchroniser les favoris entre appareils.
//
// null = synchronisation désactivée (le bloc « Synchronisation » est masqué).
// Pour l'activer, suivre « Synchroniser les favoris » dans le README, puis
// remplacer null par l'objet firebaseConfig de la console Firebase, par ex. :
//
// export const FIREBASE_CONFIG = {
//   apiKey: 'AIza…',
//   authDomain: 'mon-projet.firebaseapp.com',
//   projectId: 'mon-projet',
//   storageBucket: 'mon-projet.firebasestorage.app',
//   messagingSenderId: '123456789',
//   appId: '1:123456789:web:abc123',
// };
//
// Ces valeurs ne sont pas secrètes : elles identifient le projet. La
// protection des données vient des règles Firestore (firestore.rules).

export const FIREBASE_CONFIG = null;
