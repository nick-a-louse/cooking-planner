import { displayVersion } from "@cookplan/shared";

/** Build id baked in by the image build (sha-<commit> or a v-tag); "dev" locally. */
export const BUILD = import.meta.env.VITE_APP_VERSION as string;
export const VERSION = displayVersion(BUILD);
