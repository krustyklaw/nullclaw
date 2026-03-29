/*
 * Shim for Zig 0.15.x bundled glibc header inconsistency.
 *
 * generic-glibc/pthread.h defines PTHREAD_COND_INITIALIZER with the
 * glibc 2.34+ Y2038 8-field layout, but generic-glibc/bits/pthreadtypes.h
 * defines __pthread_cond_s with the old fewer-field layout. This mismatch
 * causes "excess elements in scalar initializer" in libcxx condition_variable.h.
 *
 * We intercept <pthread.h>, include the real one, then replace the broken
 * initializer with a simple zero-init that is valid for any union layout.
 */
#pragma once
#include_next <pthread.h>
#undef PTHREAD_COND_INITIALIZER
#define PTHREAD_COND_INITIALIZER {0}
