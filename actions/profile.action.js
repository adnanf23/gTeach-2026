"use server";

import * as profileService from "@/services/profile.service";

export async function updateProfileAsAdmin(userId, data) {
  return profileService.updateProfileAsAdmin(userId, data);
}

export async function uploadTtdAsAdmin(userId, formData) {
  return profileService.uploadTtdAsAdmin(userId, formData);
}
