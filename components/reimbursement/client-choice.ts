// Shared by the expenses list and the filing form. Kept in its own module so
// the list can name the type without importing the form and pulling the form's
// chunk into the initial page load.
export type ClientChoice = { id: string; name: string }
