/* Minimal EventToken.h stub for WebView2 compilation without Windows SDK WinRT headers */

#ifndef __eventtoken_h__
#define __eventtoken_h__

#if defined(_MSC_VER) && (_MSC_VER >= 1020)
#pragma once
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef struct EventRegistrationToken {
    __int64 value;
} EventRegistrationToken;

#ifdef __cplusplus
}
#endif

#endif /* __eventtoken_h__ */
