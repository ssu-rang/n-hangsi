package com.nhangsi.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.web.SecurityFilterChain

@Configuration
class SecurityConfig {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain =
        http
            .authorizeHttpRequests {
                it.requestMatchers(
                    "/",
                    "/poems",
                    "/poems/*",
                    "/users/*",
                    "/login",
                    "/css/**",
                    "/js/**",
                    "/images/**",
                    "/h2-console/**",
                    "/error",
                ).permitAll()
                it.anyRequest().authenticated()
            }
            .csrf { it.ignoringRequestMatchers("/h2-console/**") }
            .headers { it.frameOptions { frame -> frame.sameOrigin() } }
            .formLogin {
                it.loginPage("/login")
                    .loginProcessingUrl("/login")
                    .defaultSuccessUrl("/", true)
                    .failureUrl("/login?error")
            }
            .logout {
                it.logoutUrl("/logout")
                    .logoutSuccessUrl("/")
            }
            .build()
}
